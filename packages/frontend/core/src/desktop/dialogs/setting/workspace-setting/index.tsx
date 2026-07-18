import { useIsGatewayStudent } from '@affine/core/components/hooks/use-is-gateway-student';
import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import { ServerService } from '@affine/core/modules/cloud';
import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { EmbeddingSettings } from '@affine/core/modules/workspace-indexer-embedding';
import { ServerDeploymentType } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import {
  AiEmbeddingIcon,
  CollaborationIcon,
  IntegrationsIcon,
  PaymentIcon,
  PropertyIcon,
  SaveIcon,
  SettingsIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import type { SettingSidebarItem, SettingState } from '../types';
import { WorkspaceSettingBilling } from './billing';
import { IntegrationSetting } from './integration';
import { WorkspaceSettingLicense } from './license';
import { MembersPanel } from './members';
import { WorkspaceSettingDetail } from './preference';
import { WorkspaceSettingProperties } from './properties';
import { WorkspaceSettingStorage } from './storage';

export const WorkspaceSetting = ({
  activeTab,
  scrollAnchor,
  onCloseSetting,
  onChangeSettingState,
}: {
  activeTab: SettingTab;
  scrollAnchor?: string;
  onCloseSetting: () => void;
  onChangeSettingState: (settingState: SettingState) => void;
}) => {
  switch (activeTab) {
    case 'workspace:preference':
      return <WorkspaceSettingDetail onCloseSetting={onCloseSetting} />;
    case 'workspace:properties':
      return <WorkspaceSettingProperties />;
    case 'workspace:members':
      return (
        <MembersPanel
          onCloseSetting={onCloseSetting}
          onChangeSettingState={onChangeSettingState}
        />
      );
    case 'workspace:billing':
      return <WorkspaceSettingBilling />;
    case 'workspace:storage':
      return <WorkspaceSettingStorage onCloseSetting={onCloseSetting} />;
    case 'workspace:license':
      return <WorkspaceSettingLicense onCloseSetting={onCloseSetting} />;
    case 'workspace:integrations':
      return <IntegrationSetting scrollAnchor={scrollAnchor} />;
    case 'workspace:embedding':
      return <EmbeddingSettings />;
    default:
      return null;
  }
};

export const useWorkspaceSettingList = (): SettingSidebarItem[] => {
  const workspaceService = useService(WorkspaceService);
  const information = useWorkspaceInfo(workspaceService.workspace);
  const serverService = useService(ServerService);

  const isSelfhosted = useLiveData(
    serverService.server.config$.selector(
      c => c.type === ServerDeploymentType.Selfhosted
    )
  );

  const t = useI18n();
  const isGatewayStudent = useIsGatewayStudent();

  const showBilling =
    !isSelfhosted && information?.isTeam && information?.isOwner;
  const showLicense = information?.isOwner && isSelfhosted;
  const items = useMemo<SettingSidebarItem[]>(() => {
    return [
      {
        key: 'workspace:preference',
        title: t['com.affine.settings.workspace.preferences'](),
        icon: <SettingsIcon />,
        testId: 'workspace-setting:preference',
      },
      // Fork: студентам оставляем только Preferences
      !isGatewayStudent && {
        key: 'workspace:properties' as SettingTab,
        title: t['com.affine.settings.workspace.properties'](),
        icon: <PropertyIcon />,
        testId: 'workspace-setting:properties',
      },
      !isGatewayStudent && {
        key: 'workspace:members' as SettingTab,
        title: t['Members'](),
        icon: <CollaborationIcon />,
        testId: 'workspace-setting:members',
      },
      !isGatewayStudent && {
        key: 'workspace:integrations' as SettingTab,
        title: t['com.affine.integration.integrations'](),
        icon: <IntegrationsIcon />,
        testId: 'workspace-setting:integrations',
      },
      !isGatewayStudent && {
        key: 'workspace:storage' as SettingTab,
        title: t['Storage'](),
        icon: <SaveIcon />,
        testId: 'workspace-setting:storage',
      },
      !isGatewayStudent && {
        key: 'workspace:embedding' as SettingTab,
        title:
          t[
            'com.affine.settings.workspace.indexer-embedding.embedding.title'
          ](),
        icon: <AiEmbeddingIcon />,
        testId: 'workspace-setting:embedding',
      },
      showBilling && {
        key: 'workspace:billing' as SettingTab,
        title: t['com.affine.settings.workspace.billing'](),
        icon: <PaymentIcon />,
        testId: 'workspace-setting:billing',
      },
      showLicense && {
        key: 'workspace:license' as SettingTab,
        title: t['com.affine.settings.workspace.license'](),
        icon: <PaymentIcon />,
        testId: 'workspace-setting:license',
      },
    ].filter((item): item is SettingSidebarItem => !!item);
  }, [showBilling, showLicense, t, isGatewayStudent]);

  return items;
};
