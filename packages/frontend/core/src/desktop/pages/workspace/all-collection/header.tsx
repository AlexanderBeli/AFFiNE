import { IconButton } from '@affine/component';
import { ExplorerNavigation } from '@affine/core/components/explorer/header/navigation';
import { useIsGatewayStudent } from '@affine/core/components/hooks/use-is-gateway-student';
import { Header } from '@affine/core/components/pure/header';
import { PlusIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';

import * as styles from './header.css';

export const AllCollectionHeader = ({
  showCreateNew,
  onCreateCollection,
}: {
  showCreateNew: boolean;
  onCreateCollection?: () => void;
}) => {
  const isGatewayStudent = useIsGatewayStudent();
  return (
    <Header
      right={
        // Fork: студентам не показываем создание коллекций
        isGatewayStudent ? null : (
          <IconButton
            size="16"
            icon={<PlusIcon />}
            onClick={onCreateCollection}
            className={clsx(
              styles.headerCreateNewCollectionIconButton,
              !showCreateNew && styles.headerCreateNewButtonHidden
            )}
          />
        )
      }
      left={<ExplorerNavigation active={'collections'} />}
    />
  );
};
