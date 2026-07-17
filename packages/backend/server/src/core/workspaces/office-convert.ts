import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Controller, Logger, Param, Post } from '@nestjs/common';

import { BlobNotFound, CallMetric, readBufferWithLimit } from '../../base';
import { Models } from '../../models';
import { CurrentUser } from '../auth';
import { PermissionAccess } from '../permission';
import { QuotaService } from '../quota';
import { WorkspaceBlobStorage } from '../storage';

const execFileAsync = promisify(execFile);

// Office formats Gotenberg (LibreOffice) can convert to PDF.
// Extension matters: Gotenberg picks the converter by file extension.
const OFFICE_MIME_EXT: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  // office files are zip containers and are often sniffed as zip
  'application/zip': 'pptx',
  'application/octet-stream': 'pptx',
};

const GOTENBERG_TIMEOUT_MS = 120_000;
const MAX_SOURCE_SIZE = 512 * 1024 * 1024;
const PAGE_RENDER_DPI = 144;
const MAX_PAGES = 200;

/** PNG dimensions from the IHDR chunk (bytes 16..24). */
function readPngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24) return { width: 0, height: 0 };
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

/**
 * Converts an office attachment blob (pptx/docx/xlsx…) to PDF via
 * Gotenberg (LibreOffice) and stores the result as a new blob in the
 * same workspace, so the client can switch the attachment to the
 * native PDF embed view.
 */
@Controller('/api/workspaces')
export class OfficeConvertController {
  logger = new Logger(OfficeConvertController.name);

  constructor(
    private readonly storage: WorkspaceBlobStorage,
    private readonly ac: PermissionAccess,
    private readonly models: Models,
    private readonly quota: QuotaService
  ) {}

  @Post('/:id/blobs/:key/convert-to-pdf')
  @CallMetric('controllers', 'office_convert_to_pdf')
  async convertToPdf(
    @CurrentUser() user: CurrentUser,
    @Param('id') workspaceId: string,
    @Param('key') key: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Blobs.Write');

    const record = await this.models.blob.get(workspaceId, key);
    if (!record) {
      throw new BlobNotFound({ spaceId: workspaceId, blobId: key });
    }

    const ext = OFFICE_MIME_EXT[record.mime];
    if (!ext) {
      throw new Error(`Unsupported source mime for conversion: ${record.mime}`);
    }

    const { body } = await this.storage.get(workspaceId, key);
    if (!body) {
      throw new BlobNotFound({ spaceId: workspaceId, blobId: key });
    }
    const source = await readBufferWithLimit(body, MAX_SOURCE_SIZE);

    const pdf = await this.convertViaGotenberg(source, `document.${ext}`);

    // quota: the converted pdf counts towards workspace storage
    const checkExceeded =
      await this.quota.getWorkspaceQuotaCalculator(workspaceId);
    const result = checkExceeded(pdf.byteLength);
    if (result?.blobQuotaExceeded || result?.storageQuotaExceeded) {
      throw new Error('Workspace storage quota exceeded');
    }

    // same content-hash convention as the AFFiNE client (sha256 → base64url)
    const pdfKey = createHash('sha256')
      .update(pdf)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    await this.storage.put(workspaceId, pdfKey, pdf);
    // storage.put sniffs the mime; make sure the record says application/pdf
    await this.models.blob.upsert({
      workspaceId,
      key: pdfKey,
      mime: 'application/pdf',
      size: pdf.byteLength,
      status: 'completed',
      uploadId: null,
    });

    this.logger.log(
      `converted blob ${key} (${record.mime}, ${record.size}b) -> ${pdfKey} (pdf, ${pdf.byteLength}b) in workspace ${workspaceId}`
    );

    const pageSize = this.readFirstPageSize(pdf);

    return {
      key: pdfKey,
      size: pdf.byteLength,
      mime: 'application/pdf',
      // slide/page dimensions in pt, so the client can keep the native
      // aspect ratio of the presentation instead of the default card shape
      pageWidth: pageSize?.width ?? null,
      pageHeight: pageSize?.height ?? null,
    };
  }

  /**
   * First-page MediaBox from the PDF header. LibreOffice writes MediaBox
   * uncompressed, so a plain text scan over the head of the file works.
   */
  private readFirstPageSize(
    pdf: Buffer
  ): { width: number; height: number } | null {
    const head = pdf.subarray(0, 256 * 1024).toString('latin1');
    const match = head.match(
      /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/
    );
    if (!match) return null;
    const [x1, y1, x2, y2] = match.slice(1).map(Number);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    if (!width || !height) return null;
    return { width, height };
  }

  /**
   * Splits an office/PDF blob into per-page PNG images (pdftoppm) and
   * stores each page as a new blob, so the client can lay the pages out
   * as independent, movable image blocks on the board.
   */
  @Post('/:id/blobs/:key/convert-to-images')
  @CallMetric('controllers', 'office_convert_to_images')
  async convertToImages(
    @CurrentUser() user: CurrentUser,
    @Param('id') workspaceId: string,
    @Param('key') key: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Blobs.Write');

    const record = await this.models.blob.get(workspaceId, key);
    if (!record) {
      throw new BlobNotFound({ spaceId: workspaceId, blobId: key });
    }

    const { body } = await this.storage.get(workspaceId, key);
    if (!body) {
      throw new BlobNotFound({ spaceId: workspaceId, blobId: key });
    }
    const source = await readBufferWithLimit(body, MAX_SOURCE_SIZE);

    // office documents go through Gotenberg first; PDFs are used as-is
    let pdf: Buffer;
    if (record.mime === 'application/pdf') {
      pdf = source;
    } else {
      const ext = OFFICE_MIME_EXT[record.mime];
      if (!ext) {
        throw new Error(
          `Unsupported source mime for conversion: ${record.mime}`
        );
      }
      pdf = await this.convertViaGotenberg(source, `document.${ext}`);
    }

    const pages = await this.renderPdfPages(pdf);

    const totalSize = pages.reduce((sum, p) => sum + p.data.byteLength, 0);
    const checkExceeded =
      await this.quota.getWorkspaceQuotaCalculator(workspaceId);
    const result = checkExceeded(totalSize);
    if (result?.blobQuotaExceeded || result?.storageQuotaExceeded) {
      throw new Error('Workspace storage quota exceeded');
    }

    const stored: {
      key: string;
      size: number;
      width: number;
      height: number;
      page: number;
    }[] = [];
    for (const [index, page] of pages.entries()) {
      const pageKey = createHash('sha256')
        .update(page.data)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      await this.storage.put(workspaceId, pageKey, page.data);
      await this.models.blob.upsert({
        workspaceId,
        key: pageKey,
        mime: 'image/png',
        size: page.data.byteLength,
        status: 'completed',
        uploadId: null,
      });
      stored.push({
        key: pageKey,
        size: page.data.byteLength,
        width: page.width,
        height: page.height,
        page: index + 1,
      });
    }

    this.logger.log(
      `split blob ${key} (${record.mime}) into ${stored.length} page images in workspace ${workspaceId}`
    );

    return { pages: stored };
  }

  private async renderPdfPages(
    pdf: Buffer
  ): Promise<{ data: Buffer; width: number; height: number }[]> {
    const dir = await mkdtemp(join(tmpdir(), 'pdf-pages-'));
    try {
      const pdfPath = join(dir, 'source.pdf');
      await writeFile(pdfPath, pdf);

      await execFileAsync(
        'pdftoppm',
        [
          '-png',
          '-r',
          String(PAGE_RENDER_DPI),
          '-l',
          String(MAX_PAGES),
          pdfPath,
          join(dir, 'page'),
        ],
        { timeout: GOTENBERG_TIMEOUT_MS }
      );

      const files = (await readdir(dir))
        .filter(f => f.startsWith('page') && f.endsWith('.png'))
        .sort();
      if (!files.length) {
        throw new Error('pdftoppm produced no pages');
      }

      const pages = [];
      for (const file of files) {
        const data = await readFile(join(dir, file));
        pages.push({ data, ...readPngSize(data) });
      }
      return pages;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async convertViaGotenberg(
    source: Buffer,
    filename: string
  ): Promise<Buffer> {
    const gotenbergUrl =
      process.env.GOTENBERG_URL ?? 'http://gotenberg:3000';

    const form = new FormData();
    form.append(
      'files',
      new Blob([new Uint8Array(source)]),
      filename
    );

    const resp = await fetch(`${gotenbergUrl}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(GOTENBERG_TIMEOUT_MS),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(
        `Gotenberg conversion failed: ${resp.status} ${text.slice(0, 200)}`
      );
    }

    return Buffer.from(await resp.arrayBuffer());
  }
}
