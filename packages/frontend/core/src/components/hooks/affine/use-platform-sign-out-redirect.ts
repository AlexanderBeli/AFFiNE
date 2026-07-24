import { DefaultServerService } from '@affine/core/modules/cloud';
import { ServerFeature } from '@affine/graphql';
import { useServices } from '@toeverything/infra';
import { useCallback } from 'react';

/**
 * Platform mode (local workspaces disabled): after sign-out, wipe every trace
 * of the AFFiNE session (service workers, caches, IndexedDB, cookies) via the
 * nginx-served /clear-session page, which then returns to the platform
 * landing. Outside platform mode the provided fallback navigation runs.
 */
export const usePlatformSignOutRedirect = () => {
  const { defaultServerService } = useServices({ DefaultServerService });

  return useCallback(
    (fallback: () => void) => {
      const enableLocalWorkspace =
        BUILD_CONFIG.isNative ||
        defaultServerService.server.config$.value.features.includes(
          ServerFeature.LocalWorkspace
        );
      if (enableLocalWorkspace) {
        fallback();
      } else {
        window.location.href = '/clear-session?next=platform';
      }
    },
    [defaultServerService]
  );
};
