import { SettingHeader } from '@affine/component/setting-components';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { FrameworkScope, useService } from '@toeverything/infra';

import { SelfHostTeamCard } from './self-host-team-card';

/**
 * Fork (platform mode): the License page is informational only — the
 * self-host team plan pitch, license activation/upload, questionnaire and
 * payment method blocks are removed.
 */
export const WorkspaceSettingLicense = ({
  onCloseSetting: _onCloseSetting,
}: {
  onCloseSetting: () => void;
}) => {
  const workspace = useService(WorkspaceService).workspace;

  const t = useI18n();

  if (workspace === null) {
    return null;
  }

  return (
    <FrameworkScope scope={workspace.scope}>
      <SettingHeader
        title={t['com.affine.settings.workspace.license']()}
        subtitle={t['com.affine.settings.workspace.license.description']()}
      />
      <SelfHostTeamCard />
    </FrameworkScope>
  );
};
