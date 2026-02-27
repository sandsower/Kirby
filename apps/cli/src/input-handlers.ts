import { resolve } from 'node:path';
import type { Key } from 'ink';
import {
  hasSession,
  killSession,
  createSession,
  createWorktree,
  canRemoveBranch,
  listBranches,
  branchToSessionName,
} from '@kirby/tmux-manager';
import type { TmuxSession } from '@kirby/tmux-manager';
import {
  readConfig,
  readGlobalConfig,
  writeGlobalConfig,
  readProjectConfig,
  writeProjectConfig,
  autoDetectProjectConfig,
} from '@kirby/azure-devops';
import type {
  Config,
  ProjectConfig,
  GlobalConfig,
  PullRequestInfo,
} from '@kirby/shared-types';
import { SETTINGS_FIELDS } from './components/SettingsPanel.js';

const GLOBAL_CONFIG_KEYS = new Set<keyof Config>([
  'pat',
  'prPollInterval',
  'aiCommand',
]);

/** Persist a single config field to the correct config file (global or project) */
function persistConfigField(
  key: keyof Config,
  value: string | undefined
): void {
  if (GLOBAL_CONFIG_KEYS.has(key)) {
    const g = readGlobalConfig();
    writeGlobalConfig({ ...g, [key]: value } as GlobalConfig);
  } else {
    const p = readProjectConfig();
    writeProjectConfig({ ...p, [key]: value } as ProjectConfig);
  }
}

export interface AppContext {
  // State
  config: Config;
  branches: string[];
  branchFilter: string;
  branchIndex: number;
  paneCols: number;
  paneRows: number;
  confirmDelete: { branch: string; sessionName: string; reason: string } | null;
  confirmInput: string;
  editingField: string | null;
  settingsFieldIndex: number;
  editBuffer: string;
  focus: 'sidebar' | 'terminal';
  selectedName: string | null;
  selectedSession: TmuxSession | undefined;
  selectedIndex: number;
  sessions: TmuxSession[];
  orphanPrs: PullRequestInfo[];
  totalItems: number;

  // Actions
  setCreating: (v: boolean) => void;
  setBranchFilter: (v: string | ((prev: string) => string)) => void;
  setBranchIndex: (v: number | ((prev: number) => number)) => void;
  setSelectedIndex: (v: number | ((prev: number) => number)) => void;
  setConfirmDelete: (
    v: { branch: string; sessionName: string; reason: string } | null
  ) => void;
  setConfirmInput: (v: string | ((prev: string) => string)) => void;
  setSettingsOpen: (v: boolean) => void;
  setSettingsFieldIndex: (v: number | ((prev: number) => number)) => void;
  setEditingField: (v: string | null) => void;
  setEditBuffer: (v: string | ((prev: string) => string)) => void;
  setConfig: (v: Config | ((prev: Config) => Config)) => void;
  setFocus: (
    v:
      | 'sidebar'
      | 'terminal'
      | ((prev: 'sidebar' | 'terminal') => 'sidebar' | 'terminal')
  ) => void;
  setReconnectKey: (v: (prev: number) => number) => void;
  setBranches: (v: string[]) => void;
  flashStatus: (msg: string) => void;
  refreshSessions: () => TmuxSession[];
  refreshPr: () => void;
  performDelete: (sessionName: string, branch: string) => void;
  sendInput: (input: string, key: Key) => void;
  exit: () => void;
}

const DEFAULT_AI_COMMAND = 'claude --continue || claude';

function startAiSession(
  name: string,
  cols: number,
  rows: number,
  cwd: string,
  config: Config
) {
  const cmd = config.aiCommand || DEFAULT_AI_COMMAND;
  createSession(name, cols, rows, cmd, cwd);
}

export function handleBranchPickerInput(
  input: string,
  key: Key,
  ctx: AppContext
): void {
  if (key.escape) {
    ctx.setCreating(false);
    ctx.setBranchFilter('');
    ctx.setBranchIndex(0);
    return;
  }

  const filtered = ctx.branches.filter((b) =>
    b.toLowerCase().includes(ctx.branchFilter.toLowerCase())
  );

  if (key.upArrow) {
    ctx.setBranchIndex((i) => Math.max(i - 1, 0));
    return;
  }
  if (key.downArrow) {
    ctx.setBranchIndex((i) => Math.min(i + 1, filtered.length - 1));
    return;
  }

  if (key.return) {
    const branch =
      filtered.length > 0
        ? filtered[ctx.branchIndex]!
        : ctx.branchFilter.trim();
    if (branch) {
      const worktreePath = createWorktree(branch);
      if (worktreePath) {
        const sessionName = branchToSessionName(branch);
        startAiSession(
          sessionName,
          ctx.paneCols,
          ctx.paneRows,
          worktreePath,
          ctx.config
        );
        const updated = ctx.refreshSessions();
        const idx = updated.findIndex((s) => s.name === sessionName);
        if (idx >= 0) ctx.setSelectedIndex(idx);
      }
    }
    ctx.setCreating(false);
    ctx.setBranchFilter('');
    ctx.setBranchIndex(0);
    return;
  }

  if (key.backspace || key.delete) {
    ctx.setBranchFilter((f) => f.slice(0, -1));
    ctx.setBranchIndex(0);
    return;
  }
  if (input && !key.ctrl && !key.meta) {
    ctx.setBranchFilter((f) => f + input);
    ctx.setBranchIndex(0);
  }
}

export function handleConfirmDeleteInput(
  input: string,
  key: Key,
  ctx: AppContext
): void {
  if (key.escape) {
    ctx.setConfirmDelete(null);
    ctx.setConfirmInput('');
    return;
  }
  if (key.return) {
    if (ctx.confirmInput === ctx.confirmDelete!.branch) {
      ctx.performDelete(
        ctx.confirmDelete!.sessionName,
        ctx.confirmDelete!.branch
      );
    } else {
      ctx.flashStatus('Branch name did not match — delete cancelled');
    }
    ctx.setConfirmDelete(null);
    ctx.setConfirmInput('');
    return;
  }
  if (key.backspace || key.delete) {
    ctx.setConfirmInput((v) => v.slice(0, -1));
    return;
  }
  if (input && !key.ctrl && !key.meta) {
    ctx.setConfirmInput((v) => v + input);
  }
}

export function handleSettingsInput(
  input: string,
  key: Key,
  ctx: AppContext
): void {
  if (ctx.editingField) {
    if (key.escape) {
      ctx.setEditingField(null);
      ctx.setEditBuffer('');
      return;
    }
    if (key.return) {
      const field = SETTINGS_FIELDS[ctx.settingsFieldIndex]!;
      const value = ctx.editBuffer || undefined;
      ctx.setConfig({ ...ctx.config, [field.key]: value });
      persistConfigField(field.key, value);

      ctx.setEditingField(null);
      ctx.setEditBuffer('');
      return;
    }
    if (key.backspace || key.delete) {
      ctx.setEditBuffer((v) => v.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      ctx.setEditBuffer((v) => v + input);
    }
    return;
  }

  if (key.escape) {
    ctx.setSettingsOpen(false);
    return;
  }
  if (input === 'j' || key.downArrow) {
    ctx.setSettingsFieldIndex((i) =>
      Math.min(i + 1, SETTINGS_FIELDS.length - 1)
    );
    return;
  }
  if (input === 'k' || key.upArrow) {
    ctx.setSettingsFieldIndex((i) => Math.max(i - 1, 0));
    return;
  }
  if (key.leftArrow || key.rightArrow) {
    const field = SETTINGS_FIELDS[ctx.settingsFieldIndex]!;
    if (field.presets) {
      const namedPresets = field.presets.filter((p) => p.value !== null);
      const currentValue = ctx.config[field.key] as string | undefined;
      const effectiveValue = currentValue || namedPresets[0]!.value;
      let idx = namedPresets.findIndex((p) => p.value === effectiveValue);
      if (idx === -1) idx = 0;
      if (key.rightArrow) {
        idx = (idx + 1) % namedPresets.length;
      } else {
        idx = (idx - 1 + namedPresets.length) % namedPresets.length;
      }
      const preset = namedPresets[idx]!;
      ctx.setConfig({ ...ctx.config, [field.key]: preset.value });
      persistConfigField(field.key, preset.value ?? undefined);
    }
    return;
  }
  if (key.return) {
    const field = SETTINGS_FIELDS[ctx.settingsFieldIndex]!;
    ctx.setEditingField(field.key);
    ctx.setEditBuffer(String(ctx.config[field.key] ?? ''));
    return;
  }
  if (input === 'a') {
    const { updated, detected } = autoDetectProjectConfig();
    if (updated) {
      ctx.setConfig(readConfig());
      const fields = Object.keys(detected).join(', ');
      ctx.flashStatus(`Auto-detected: ${fields}`);
    } else {
      ctx.flashStatus('Nothing new to detect (all fields already set)');
    }
    return;
  }
}

export function handleSidebarInput(
  input: string,
  key: Key,
  ctx: AppContext
): void {
  if (input === 'q') {
    ctx.exit();
    return;
  }
  if (input === 'c') {
    ctx.setBranches(listBranches());
    ctx.setCreating(true);
    ctx.setBranchFilter('');
    ctx.setBranchIndex(0);
    return;
  }
  if (input === 'd' && ctx.selectedSession) {
    const sessionName = ctx.selectedSession.name;
    const currentBranches = listBranches();
    const branch = currentBranches.find(
      (b) => branchToSessionName(b) === sessionName
    );
    if (branch) {
      const check = canRemoveBranch(branch);
      if (!check.safe) {
        if (
          check.reason === 'not pushed to upstream' ||
          check.reason === 'uncommitted changes'
        ) {
          ctx.setConfirmDelete({ branch, sessionName, reason: check.reason });
          ctx.setConfirmInput('');
        } else {
          ctx.flashStatus(`Cannot delete: ${check.reason}`);
        }
        return;
      }
      ctx.performDelete(sessionName, branch);
    } else {
      killSession(sessionName);
      const updated = ctx.refreshSessions();
      if (ctx.selectedIndex >= updated.length) {
        ctx.setSelectedIndex(Math.max(0, updated.length - 1));
      }
    }
    return;
  }
  if (input === 'K' && ctx.selectedSession) {
    killSession(ctx.selectedSession.name);
    ctx.refreshSessions();
    return;
  }
  if (input === 's') {
    ctx.setSettingsOpen(true);
    ctx.setSettingsFieldIndex(0);
    return;
  }
  if (input === 'r') {
    ctx.refreshPr();
    ctx.flashStatus('Refreshing PR data...');
    return;
  }
  if (input === 'j' || key.downArrow) {
    ctx.setSelectedIndex((i) => Math.min(i + 1, ctx.totalItems - 1));
  }
  if (input === 'k' || key.upArrow) {
    ctx.setSelectedIndex((i) => Math.max(i - 1, 0));
  }
  if (
    key.return &&
    ctx.selectedIndex >= ctx.sessions.length &&
    ctx.orphanPrs.length > 0
  ) {
    const prIndex = ctx.selectedIndex - ctx.sessions.length;
    const pr = ctx.orphanPrs[prIndex];
    if (pr) {
      const worktreePath = createWorktree(pr.sourceBranch);
      if (worktreePath) {
        const sessionName = branchToSessionName(pr.sourceBranch);
        startAiSession(
          sessionName,
          ctx.paneCols,
          ctx.paneRows,
          worktreePath,
          ctx.config
        );
        const updated = ctx.refreshSessions();
        const idx = updated.findIndex((s) => s.name === sessionName);
        if (idx >= 0) ctx.setSelectedIndex(idx);
      }
    }
  }
}

export function handleGlobalInput(
  input: string,
  key: Key,
  ctx: AppContext
): void {
  // Tab switches focus — auto-create tmux session if needed
  if (key.tab) {
    if (
      ctx.focus === 'sidebar' &&
      ctx.selectedName &&
      !hasSession(ctx.selectedName)
    ) {
      const worktreePath = resolve(
        process.cwd(),
        '.tui/worktrees/' + ctx.selectedName
      );
      startAiSession(
        ctx.selectedName,
        ctx.paneCols,
        ctx.paneRows,
        worktreePath,
        ctx.config
      );
      ctx.refreshSessions();
      ctx.setReconnectKey((k) => k + 1);
    }
    ctx.setFocus((f) => (f === 'sidebar' ? 'terminal' : 'sidebar'));
    return;
  }

  // Escape returns to sidebar
  if (key.escape) {
    if (ctx.focus === 'terminal') {
      ctx.setFocus('sidebar');
      return;
    }
  }

  if (ctx.focus === 'sidebar') {
    handleSidebarInput(input, key, ctx);
  } else {
    ctx.sendInput(input, key);
  }
}
