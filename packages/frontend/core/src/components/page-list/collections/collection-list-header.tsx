import { Button } from '@affine/component';
import { useIsGatewayStudent } from '@affine/core/components/hooks/use-is-gateway-student';
import { useI18n } from '@affine/i18n';

import * as styles from './collection-list-header.css';

export const CollectionListHeader = ({
  onCreate,
}: {
  onCreate: () => void;
}) => {
  const t = useI18n();
  const isGatewayStudent = useIsGatewayStudent();

  return (
    <div className={styles.collectionListHeader}>
      <div className={styles.collectionListHeaderTitle}>
        {t['com.affine.collections.header']()}
      </div>
      {/* Fork: студентам не показываем создание коллекций */}
      {!isGatewayStudent && (
        <Button
          className={styles.newCollectionButton}
          onClick={onCreate}
          data-testid="all-collection-new-button"
        >
          {t['com.affine.collections.empty.new-collection-button']()}
        </Button>
      )}
    </div>
  );
};
