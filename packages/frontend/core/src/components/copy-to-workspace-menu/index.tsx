import { notify } from '@affine/component';
import { MenuItem, MenuSub } from '@affine/component/ui/menu';
import { copyDocToWorkspace } from '@affine/core/blocksuite/utils/copy-doc-to-workspace';
import { DocsService } from '@affine/core/modules/doc';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { DuplicateIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';

import { useAsyncCallback } from '../hooks/affine-async-hooks';

/**
 * Template workflow: copy a doc (with blobs) into another workspace the user
 * is a member of — e.g. from the shared read-only "Templates" workspace into
 * a teacher's own workspace, or a teacher's board into the shared one.
 *
 * Shared between the doc header «⋯» menu and the All docs row menu: the doc
 * is loaded lazily by id, so it works even when the doc is not open.
 */
const CopyToWorkspaceItem = ({
  meta,
  docId,
}: {
  meta: WorkspaceMetadata;
  docId: string;
}) => {
  const workspacesService = useService(WorkspacesService);
  const docsService = useService(DocsService);
  const profile = workspacesService.getProfile(meta);
  useEffect(() => {
    profile.revalidate();
  }, [profile]);
  const name = useLiveData(profile.profile$)?.name ?? '…';

  const onSelect = useAsyncCallback(async () => {
    try {
      const { doc, release } = docsService.open(docId);
      try {
        await doc.waitForSyncReady();
        const { workspace, dispose } = workspacesService.open({
          metadata: meta,
        });
        try {
          await workspace.engine.doc.waitForDocReady(workspace.id);
          const newDocId = await copyDocToWorkspace(
            doc.blockSuiteDoc,
            workspace.docCollection
          );
          workspace.engine.doc.addPriority(workspace.id, 100);
          workspace.engine.doc.addPriority(newDocId, 100);
          await workspace.engine.doc.waitForSynced(workspace.id);
          await workspace.engine.doc.waitForSynced(newDocId);
          notify.success({
            title: 'Copied',
            message: `The doc has been copied to "${name}".`,
          });
        } finally {
          dispose();
        }
      } finally {
        release();
      }
    } catch (e) {
      console.error(e);
      notify.error({
        title: 'Copy failed',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [meta, name, docId, docsService, workspacesService]);

  return (
    <MenuItem data-testid={`copy-to-workspace-${meta.id}`} onSelect={onSelect}>
      {name}
    </MenuItem>
  );
};

export const CopyToWorkspaceMenu = ({
  docId,
  currentWorkspaceId,
}: {
  docId: string;
  currentWorkspaceId: string;
}) => {
  const workspacesService = useService(WorkspacesService);
  const metas = useLiveData(workspacesService.list.workspaces$);
  const targets = metas.filter(
    meta => meta.id !== currentWorkspaceId && meta.flavour !== 'local'
  );

  if (!targets.length) return null;

  return (
    <MenuSub
      items={targets.map(meta => (
        <CopyToWorkspaceItem key={meta.id} meta={meta} docId={docId} />
      ))}
      triggerOptions={{
        prefixIcon: <DuplicateIcon />,
        'data-testid': 'editor-option-menu-copy-to-workspace',
      }}
    >
      Copy to workspace
    </MenuSub>
  );
};
