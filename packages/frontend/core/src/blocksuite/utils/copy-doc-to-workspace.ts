import { getAFFiNEWorkspaceSchema } from '@affine/core/modules/workspace/global-schema';
import {
  replaceIdMiddleware,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import type { Store, Workspace } from '@blocksuite/affine/store';
import { Transformer } from '@blocksuite/affine/store';

/**
 * Copies a doc (with all its blobs) into another workspace the user is a
 * member of. Used for the template workflow: teachers copy template boards
 * from the shared read-only workspace into their own, and suggest their
 * boards back into the shared one.
 *
 * Returns the id of the newly created doc in the target workspace.
 */
export async function copyDocToWorkspace(
  sourceDoc: Store,
  targetCollection: Workspace
): Promise<string> {
  const schema = getAFFiNEWorkspaceSchema();
  const sourceCollection = sourceDoc.workspace;

  const exportJob = new Transformer({
    schema,
    blobCRUD: sourceCollection.blobSync,
    docCRUD: {
      create: (id: string) =>
        sourceCollection.createDoc(id).getStore({ id }),
      get: (id: string) =>
        sourceCollection.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => sourceCollection.removeDoc(id),
    },
    middlewares: [titleMiddleware(sourceCollection.meta.docMetas)],
  });

  const snapshot = await exportJob.docToSnapshot(sourceDoc);
  if (!snapshot) {
    throw new Error('Failed to snapshot the doc');
  }

  // pull every referenced blob out of the source workspace
  const pathBlobIdMap = exportJob.assetsManager.getPathBlobIdMap();
  for (const blobId of pathBlobIdMap.values()) {
    try {
      await exportJob.assetsManager.readFromBlob(blobId);
    } catch (e) {
      console.warn(`copy-doc: failed to read blob ${blobId}`, e);
    }
  }

  const importJob = new Transformer({
    schema,
    blobCRUD: targetCollection.blobSync,
    docCRUD: {
      create: (id: string) =>
        targetCollection.createDoc(id).getStore({ id }),
      get: (id: string) =>
        targetCollection.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => targetCollection.removeDoc(id),
    },
    middlewares: [
      replaceIdMiddleware(targetCollection.idGenerator),
      titleMiddleware(targetCollection.meta.docMetas),
    ],
  });

  for (const [id, blob] of exportJob.assets) {
    importJob.assets.set(id, blob);
  }

  const doc = await importJob.snapshotToDoc(snapshot);
  if (!doc) {
    throw new Error('Failed to import the doc into the target workspace');
  }

  return doc.id;
}
