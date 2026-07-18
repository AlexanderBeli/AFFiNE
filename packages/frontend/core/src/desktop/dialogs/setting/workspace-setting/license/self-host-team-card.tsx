import { SettingRow } from '@affine/component/setting-components';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceQuotaService } from '@affine/core/modules/quota';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

import * as styles from './styles.css';

/**
 * Fork (platform mode): informational card only — license activation,
 * upload and payment flows are removed. Seats come from the server quota.
 */
export const SelfHostTeamCard = () => {
  const t = useI18n();

  const workspaceQuotaService = useService(WorkspaceQuotaService);
  const permission = useService(WorkspacePermissionService).permission;
  const workspaceQuota = useLiveData(workspaceQuotaService.quota.quota$);

  const revalidate = useCallback(() => {
    permission.revalidate();
    workspaceQuotaService.quota.revalidate();
  }, [permission, workspaceQuotaService]);

  useEffect(() => {
    revalidate();
  }, [revalidate]);

  const seatLimit = workspaceQuota?.humanReadable.memberLimit || '50';

  return (
    <div className={styles.planCard}>
      <div className={styles.container}>
        <div className={styles.currentPlan}>
          <SettingRow
            spreadCol={false}
            name={t['com.affine.settings.workspace.license.self-host']()}
            desc={`Basic version: ${seatLimit} seats. For more, contact admin.`}
          />
        </div>
        <div className={styles.planPrice}>
          <span className={styles.seat}>
            {t[
              'com.affine.settings.workspace.license.self-host-team.seats'
            ]()}
          </span>
          <span>
            {`${workspaceQuota?.memberCount ?? '…'}/${workspaceQuota?.memberLimit ?? seatLimit}`}
          </span>
        </div>
      </div>
    </div>
  );
};
