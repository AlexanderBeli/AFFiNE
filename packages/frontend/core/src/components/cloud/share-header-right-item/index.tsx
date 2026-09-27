import { AuthService } from '@affine/core/modules/cloud';
import type { DocMode } from '@blocksuite/affine/model';
import { useLiveData, useService } from '@toeverything/infra';

import { ImportTemplateButton } from './import-template';
import { PresentButton } from './present';
import * as styles from './styles.css';
import { PublishPageUserAvatar } from './user-avatar';

export type ShareHeaderRightItemProps = {
  publishMode: DocMode;
  isTemplate?: boolean;
  templateName?: string;
  snapshotUrl?: string;
};

const ShareHeaderRightItem = ({
  publishMode,
  isTemplate,
  templateName,
  snapshotUrl,
}: ShareHeaderRightItemProps) => {
  const loginStatus = useLiveData(useService(AuthService).session.status$);
  const authenticated = loginStatus === 'authenticated';
  return (
    <div className={styles.rightItemContainer}>
      {isTemplate ? (
        <ImportTemplateButton
          name={templateName ?? ''}
          snapshotUrl={snapshotUrl ?? ''}
        />
      ) : (
        <>
          {/* SpeakZone: на общих досках для учеников нет «Login or Sign Up»
              (вход — только через платформу, OIDC). */}
          {publishMode === 'edgeless' ? <PresentButton /> : null}
          {authenticated ? (
            <>
              <div
                className={styles.headerDivider}
                data-authenticated={true}
                data-is-edgeless={publishMode === 'edgeless'}
              />
              <PublishPageUserAvatar />
            </>
          ) : null}
        </>
      )}
    </div>
  );
};

export default ShareHeaderRightItem;
