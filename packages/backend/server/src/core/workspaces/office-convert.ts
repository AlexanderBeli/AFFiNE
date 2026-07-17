import { createHash } from 'node:crypto';

import { Controller, Logger, Param, Post } from '@nestjs/common';

import { BlobNotFound, CallMetric, readBufferWithLimit } from '../../base';
import { Models } from '../../models';
import { CurrentUser } from '../auth';
import { PermissionAccess } from '../permission';
import { QuotaService } from '../quota';
import { WorkspaceBlobStorage } from '../storage';

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

    return {
      key: pdfKey,
      size: pdf.byteLength,
      mime: 'application/pdf',
    };
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
