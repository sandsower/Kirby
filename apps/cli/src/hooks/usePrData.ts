import { useState, useEffect, useRef, useCallback } from 'react';
import type { AppConfig, VcsProvider, BranchPrMap } from '@kirby/vcs-core';
import { isVcsConfigured } from '@kirby/vcs-core';
import { logError } from '../log.js';

export function usePrData(
  config: AppConfig,
  provider: VcsProvider | null,
  refreshInterval = 60000
) {
  const [prMap, setPrMap] = useState<BranchPrMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    if (!provider || !isVcsConfigured(config, provider)) return;
    setLoading(true);
    provider
      .fetchPullRequests(config.vendorAuth, config.vendorProject)
      .then((map) => {
        if (mountedRef.current) {
          setPrMap(map);
          setError(null);
        }
      })
      .catch((err: Error) => {
        logError(`fetchPullRequests [${provider.id}]`, err);
        if (mountedRef.current) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [config, provider]);

  useEffect(() => {
    mountedRef.current = true;
    if (!provider || !isVcsConfigured(config, provider)) return;
    refresh();
    const interval = setInterval(
      refresh,
      config.prPollInterval ?? refreshInterval
    );
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [config, provider, refresh, refreshInterval]);

  return { prMap, loading, error, refresh };
}
