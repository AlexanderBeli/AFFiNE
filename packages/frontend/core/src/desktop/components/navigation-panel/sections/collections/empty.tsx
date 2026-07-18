import { useI18n } from '@affine/i18n';
import { ViewLayersIcon } from '@blocksuite/icons/rc';

import { NavigationPanelEmptySection } from '../../layouts/empty-section';

export const RootEmpty = ({
  onClickCreate,
}: {
  onClickCreate?: () => void;
}) => {
  const t = useI18n();

  return (
    <NavigationPanelEmptySection
      icon={ViewLayersIcon}
      message={t['com.affine.collections.empty.message']()}
      messageTestId="slider-bar-collection-empty-message"
      // кнопка создания — только когда передан обработчик (скрыта у студентов)
      actionText={
        onClickCreate
          ? t['com.affine.collections.empty.new-collection-button']()
          : undefined
      }
      onActionClick={onClickCreate}
    />
  );
};
