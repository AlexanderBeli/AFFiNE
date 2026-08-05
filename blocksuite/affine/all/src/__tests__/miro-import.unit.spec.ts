/**
 * Validation harness for web_miro_converter output.
 *
 * Imports the generated .bs.zip exactly the way AFFiNE's
 * "Import → Snapshot" does (ZipTransformer.importDocs internals),
 * then inspects the resulting doc.
 *
 * Set MIRO_ZIP env var to override the zip path.
 */
import { existsSync, readFileSync } from 'node:fs';

import type { SurfaceBlockModel } from '@blocksuite/affine-block-surface';
import { replaceIdMiddleware } from '@blocksuite/affine-shared/adapters';
import { compareLayer } from '@blocksuite/std/gfx';
import { DocSnapshotSchema, Schema, Transformer } from '@blocksuite/store';
import { TestWorkspace } from '@blocksuite/store/test';
import * as fflate from 'fflate';
import { describe, expect, test } from 'vitest';

import { AffineSchemas } from '../schemas.js';
import { testStoreExtensions } from './utils/store.js';

// happy-dom lacks a working DOMMatrix/DOMPoint pair (used by connector
// path computation). Minimal polyfill: translate+rotate is all math.ts needs.
class DOMMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  translateSelf(tx: number, ty: number) {
    this.e += this.a * tx + this.c * ty;
    this.f += this.b * tx + this.d * ty;
    return this;
  }

  rotateSelf(deg: number) {
    const r = (deg * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const { a, b, c, d } = this;
    this.a = a * cos + c * sin;
    this.b = b * cos + d * sin;
    this.c = -a * sin + c * cos;
    this.d = -b * sin + d * cos;
    return this;
  }
}

class DOMPointPolyfill {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1
  ) {}

  matrixTransform(m: DOMMatrixPolyfill) {
    return new DOMPointPolyfill(
      m.a * this.x + m.c * this.y + m.e,
      m.b * this.x + m.d * this.y + m.f
    );
  }
}

class DOMQuadPolyfill {
  points: DOMPointPolyfill[];

  constructor(...points: DOMPointPolyfill[]) {
    this.points = points;
  }

  getBounds() {
    const xs = this.points.map(p => p.x);
    const ys = this.points.map(p => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    return { x, y, width, height, left: x, top: y };
  }
}

(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrixPolyfill;
(globalThis as Record<string, unknown>).DOMPoint = DOMPointPolyfill;
(globalThis as Record<string, unknown>).DOMQuad = DOMQuadPolyfill;

const ZIP_PATH =
  process.env.MIRO_ZIP ??
  '/Users/alexander/Documents/InstaBot/web_miro_converter/output/бесплатный CREATIVITY BOX.blocksuite.bs.zip';

const VALID_SHAPE_TYPES = new Set(['rect', 'ellipse', 'diamond', 'triangle']);
const VALID_STROKE_STYLES = new Set(['solid', 'dash', 'none']);

function loadZip(path: string) {
  const raw = new Uint8Array(readFileSync(path));
  const entries = fflate.unzipSync(raw);
  let snapshotJson: string | null = null;
  const assets = new Map<string, Uint8Array>();

  for (const [name, content] of Object.entries(entries)) {
    if (name.includes('MACOSX') || name.includes('DS_Store')) continue;
    if (name.startsWith('assets/') && !name.endsWith('/')) {
      assets.set(name.slice('assets/'.length), content);
      continue;
    }
    if (name.endsWith('.snapshot.json')) {
      snapshotJson = new TextDecoder().decode(content);
    }
  }

  if (!snapshotJson) throw new Error('No .snapshot.json found in zip');
  return { snapshot: JSON.parse(snapshotJson), assets };
}

function createJob() {
  const schema = new Schema().register(AffineSchemas);
  const collection = new TestWorkspace();
  collection.storeExtensions = testStoreExtensions;
  collection.meta.initialize();
  return {
    collection,
    job: new Transformer({
      schema,
      blobCRUD: collection.blobSync,
      docCRUD: {
        create: (id: string) => collection.createDoc(id).getStore({ id }),
        get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
        delete: (id: string) => collection.removeDoc(id),
      },
      // Как в ZipTransformer.importDocs: id блоков перегенерируются —
      // конвертер не должен зависеть от исходных id блоков
      middlewares: [replaceIdMiddleware(collection.idGenerator)],
    }),
  };
}

describe.skipIf(!existsSync(ZIP_PATH))('miro converter zip import', () => {
  test('zip imports cleanly through the real BlockSuite transformer', async () => {
    const { snapshot, assets } = loadZip(ZIP_PATH);

    // 1. Zod-schema validation — what Transformer runs internally
    expect(() => DocSnapshotSchema.parse(snapshot)).not.toThrow();

    const { job } = createJob();

    // Register zip assets the way ZipTransformer.importDocs does
    for (const [name, content] of assets) {
      const assetsId = name.replace(/\.[^/.]+$/, '');
      const ext = name.split('.').at(-1) ?? '';
      const mime = ext === 'png' ? 'image/png' : `image/${ext}`;
      job.assets.set(
        assetsId,
        new File([content as BlobPart], name, { type: mime })
      );
    }

    // 2. The actual import — throws on any structural problem
    const doc = await job.snapshotToDoc(snapshot);
    expect(doc).toBeDefined();

    // 3. Inspect the imported doc
    const surfaces = doc!.getModelsByFlavour('affine:surface');
    expect(surfaces.length).toBe(1);
    const surface = surfaces[0] as SurfaceBlockModel;

    const elementsMap = surface.props.elements.getValue()!;
    const elementCount = elementsMap.size;
    expect(elementCount).toBeGreaterThan(1000);

    // 3a. Every element must have valid shapeType / strokeStyle / index / xywh
    const badElements: string[] = [];
    elementsMap.forEach((el, id) => {
      const type = el.get('type') as string;
      const index = el.get('index') as string;
      const xywh = el.get('xywh') as string | undefined;
      if (!/^[a-zA-Z][0-9A-Za-z]+$/.test(index ?? '')) {
        badElements.push(`${id}: bad index ${index}`);
      }
      if (!xywh || !/^\[-?[\d.]+, ?-?[\d.]+, ?[\d.]+, ?[\d.]+\]$/.test(xywh)) {
        badElements.push(`${id}: bad xywh ${xywh}`);
      }
      if (type === 'shape') {
        const shapeType = el.get('shapeType') as string;
        if (!VALID_SHAPE_TYPES.has(shapeType)) {
          badElements.push(`${id}: bad shapeType ${shapeType}`);
        }
        const strokeStyle = el.get('strokeStyle') as string;
        if (!VALID_STROKE_STYLES.has(strokeStyle)) {
          badElements.push(`${id}: bad strokeStyle ${strokeStyle}`);
        }
      }
      if (type === 'connector') {
        const source = el.get('source') as Record<string, unknown>;
        const target = el.get('target') as Record<string, unknown>;
        for (const end of [source, target]) {
          if (!end || (end.id === undefined && end.position === undefined)) {
            badElements.push(`${id}: bad connector endpoint`);
          }
        }
      }
    });
    expect(badElements.slice(0, 20)).toEqual([]);

    // 3b. Shapes must carry their text
    let shapesWithText = 0;
    elementsMap.forEach(el => {
      if (el.get('type') === 'shape' && el.get('text')) shapesWithText += 1;
    });
    expect(shapesWithText).toBeGreaterThan(100);

    // 3c. Image blocks with resolvable blobs
    const images = doc!.getModelsByFlavour('affine:image');
    expect(images.length).toBeGreaterThan(500);

    const missingBlobs: string[] = [];
    for (const img of images) {
      const sourceId = (img.props as { sourceId?: string }).sourceId;
      if (!sourceId) {
        missingBlobs.push(`${img.id}: empty sourceId`);
        continue;
      }
      if (!job.assets.get(sourceId)) {
        missingBlobs.push(`${img.id}: no asset for ${sourceId}`);
      }
    }
    expect(missingBlobs.slice(0, 10)).toEqual([]);

    // 3d. Frames
    const frames = doc!.getModelsByFlavour('affine:frame');
    expect(frames.length).toBeGreaterThan(10);

    // 3e. Notes visible in page mode
    const notes = doc!.getModelsByFlavour('affine:note');
    expect(notes.length).toBeGreaterThan(0);

    // 3f. Sane coordinates: everything within a few hundred thousand px of origin
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    elementsMap.forEach(el => {
      const xywh = el.get('xywh') as string | undefined;
      if (!xywh) return;
      const [x, y, w, h] = JSON.parse(xywh) as number[];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    });
    expect(minX).toBeGreaterThanOrEqual(-10);
    expect(minY).toBeGreaterThanOrEqual(-10);
    // Доска масштабирована: фреймы ~1600px, вся доска в десятках тысяч px
    expect(maxX).toBeLessThan(60_000);
    expect(maxY).toBeLessThan(60_000);

    // 3g. Цветные заставки фреймов: подложка под содержимым каждого
    // непрозрачного фрейма + background на самом фрейме
    let covers = 0;
    elementsMap.forEach((el, id) => {
      if (!id.endsWith('_bg')) return;
      covers += 1;
      const index = el.get('index') as string;
      expect(index < 'a0', `cover ${id} must render below content`).toBe(true);
      expect(el.get('filled')).toBe(true);
    });
    expect(covers).toBeGreaterThan(20);

    for (const frame of frames) {
      const background = (frame.props as { background?: unknown }).background;
      expect(typeof background).toBe('string');
      expect((background as string).startsWith('#')).toBe(true);
      // Группировка через childElementIds ломает z-порядок после
      // replaceIdMiddleware — конвертер должен оставлять её пустой
      expect(
        (frame.props as { childElementIds?: object }).childElementIds ?? {}
      ).toEqual({});
    }

    // 3h. Реальный порядок отрисовки (как в LayerManager AFFiNE):
    // фреймы < подложки < контент; все image-блоки выше всех подложек
    const gfxModels = [
      ...(surface['_elementModels']
        ? [...surface['_elementModels']].map(([, v]: [string, any]) => v.model)
        : []),
      ...images,
      ...frames,
    ] as any[];
    gfxModels.sort(compareLayer);

    const firstNonFrame = gfxModels.findIndex(
      m => m.flavour !== 'affine:frame'
    );
    const lastFrame = gfxModels
      .map(m => m.flavour)
      .lastIndexOf('affine:frame');
    expect(lastFrame, 'frames must be the bottom layer').toBeLessThan(
      firstNonFrame
    );

    const lastCoverPos = Math.max(
      ...gfxModels.flatMap((m, i) => (String(m.id).endsWith('_bg') ? [i] : []))
    );
    const firstImagePos = gfxModels.findIndex(
      m => m.flavour === 'affine:image'
    );
    expect(
      firstImagePos,
      'images must render above frame covers'
    ).toBeGreaterThan(lastCoverPos);
  }, 120000);
});
