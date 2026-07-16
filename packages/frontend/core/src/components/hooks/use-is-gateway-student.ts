import { UserFeatureService } from '@affine/core/modules/cloud';
import { FeatureType } from '@affine/graphql';
import { useLiveData, useService } from '@toeverything/infra';

/**
 * Returns `true` while the user's feature list is still loading or when the
 * user has the `GatewayStudent` feature. Use this to hide creation UIs for
 * gateway-managed student accounts.
 */
export const useIsGatewayStudent = () => {
  const userFeatureService = useService(UserFeatureService);
  const features = useLiveData(userFeatureService.userFeature.features$);

  return (
    features === null || features?.some(f => f === FeatureType.GatewayStudent)
  );
};
