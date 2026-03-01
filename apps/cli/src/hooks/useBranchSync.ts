import { useState, useEffect, useRef, useCallback } from 'react';
import type { AppConfig, VcsProvider } from '@kirby/vcs-core';
import { isVcsConfigured } from '@kirby/vcs-core';
import {
  fetchRemote,
  fastForwardMaster,
  countConflicts,
  canRemoveBranch,
  rebaseOntoMaster,
  listWorktrees,
  branchToSessionName,
} from '@kirby/tmux-manager';
import { logError } from '../log.js';

const DEFAULT_POLL_MS = 3_600_000; // 1 hour
const MIN_POLL_MS = 300_000; // 5 minutes

export interface BranchSyncResult {
  mergedBranches: Set<string>;
  conflictCounts: Map<string, number>;
  triggerSync: () => void;
}

export function useBranchSync(
  config: AppConfig,
  provider: VcsProvider | null,
  worktreeBranches: string[],
  onAutoDelete: (sessionName: string, branch: string) => void
): BranchSyncResult {
  const [mergedBranches, setMergedBranches] = useState<Set<string>>(new Set());
  const [conflictCounts, setConflictCounts] = useState<Map<string, number>>(
    new Map()
  );
  const mountedRef = useRef(true);
  const onAutoDeleteRef = useRef(onAutoDelete);
  onAutoDeleteRef.current = onAutoDelete;

  const runSync = useCallback(async () => {
    if (!provider || !isVcsConfigured(config, provider)) return;

    // 1. Fetch remote refs + prune
    fetchRemote();

    // 2. Fast-forward local master
    fastForwardMaster();

    // 3. Query VCS for merged PRs
    const branches = [...worktreeBranches];
    if (branches.length === 0) return;

    let merged: Set<string>;
    try {
      merged = provider.fetchMergedBranches
        ? await provider.fetchMergedBranches(
            config.vendorAuth,
            config.vendorProject,
            branches
          )
        : new Set<string>();
    } catch (err: unknown) {
      logError('fetchMergedBranches', err);
      merged = new Set<string>();
    }

    if (!mountedRef.current) return;
    setMergedBranches(merged);

    // 4. Auto-delete merged branches
    if (config.autoDeleteOnMerge) {
      for (const branch of merged) {
        const check = canRemoveBranch(branch);
        if (check.safe) {
          onAutoDeleteRef.current(branchToSessionName(branch), branch);
        }
      }
    }

    // 5. Auto-rebase non-merged branches
    if (config.autoRebase) {
      const worktrees = listWorktrees();
      for (const branch of branches) {
        if (merged.has(branch)) continue;
        const wt = worktrees.find((w) => w.branch === branch);
        if (wt) {
          rebaseOntoMaster(wt.path);
        }
      }
    }

    // 6. Count conflicts for non-merged branches
    const conflicts = new Map<string, number>();
    for (const branch of branches) {
      if (merged.has(branch)) continue;
      const count = countConflicts(branch);
      if (count > 0) conflicts.set(branch, count);
    }
    if (mountedRef.current) {
      setConflictCounts(conflicts);
    }
  }, [config, provider, worktreeBranches]);

  useEffect(() => {
    mountedRef.current = true;
    if (!provider || !isVcsConfigured(config, provider)) return;

    // Run immediately on mount
    runSync();

    const interval = Math.max(
      MIN_POLL_MS,
      config.mergePollInterval ?? DEFAULT_POLL_MS
    );
    const timer = setInterval(runSync, interval);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [config, provider, runSync]);

  return { mergedBranches, conflictCounts, triggerSync: runSync };
}
