import { Button } from '@affine/component';
import { useIsGatewayStudent } from '@affine/core/components/hooks/use-is-gateway-student';
import { useI18n } from '@affine/i18n';

import * as styles from './tag-list-header.css';

export const TagListHeader = ({ onOpen }: { onOpen: () => void }) => {
  const t = useI18n();
  const isGatewayStudent = useIsGatewayStudent();
  return (
    <div className={styles.tagListHeader}>
      <div className={styles.tagListHeaderTitle}>{t['Tags']()}</div>
      {/* Fork: студентам не показываем создание тегов */}
      {!isGatewayStudent && (
        <Button
          className={styles.newTagButton}
          onClick={onOpen}
          data-testid="all-tags-new-button"
        >
          {t['com.affine.tags.empty.new-tag-button']()}
        </Button>
      )}
    </div>
  );
};
