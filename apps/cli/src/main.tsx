import { useState, useEffect, useRef, useCallback } from "react";
import { execSync } from "node:child_process";
import { render, Text, Box, useInput, useApp, useStdout, type Key } from "ink";
import {
  isAvailable,
  listSessions,
  killSession,
  createSession,
  createWorktree,
  removeWorktree,
  canRemoveBranch,
  listBranches,
  branchToSessionName,
} from "@workflow-manager/tmux-manager";
import type { TmuxSession } from "@workflow-manager/tmux-manager";
import { ControlConnection } from "@workflow-manager/tmux-control";
import {
  fetchPullRequestsWithComments,
  readConfig,
  writeConfig,
  isAdoConfigured,
  parseAdoRemoteUrl,
} from "@workflow-manager/azure-devops";
import type { AdoConfig } from "@workflow-manager/azure-devops";
import type { BranchPrMap, PullRequestInfo, Config } from "@workflow-manager/shared-types";

// --- Components ---

type Focus = "sidebar" | "terminal";

function Sidebar({
  sessions,
  selectedIndex,
  focused,
  prMap,
  adoConfigured,
  sidebarWidth,
}: {
  sessions: TmuxSession[];
  selectedIndex: number;
  focused: boolean;
  prMap: BranchPrMap;
  adoConfigured: boolean;
  sidebarWidth: number;
}) {
  // inner width = sidebarWidth - 2 (border) - 2 (paddingX)
  const innerWidth = Math.max(10, sidebarWidth - 4);
  return (
    <Box
      flexDirection="column"
      width={sidebarWidth}
      borderStyle="round"
      borderColor={focused ? "blue" : "gray"}
      paddingX={1}
    >
      <Text bold color={focused ? "blue" : "gray"}>
        Sessions
      </Text>
      <Text dimColor>{"─".repeat(innerWidth)}</Text>
      {sessions.length === 0 ? (
        <Text dimColor>(no sessions)</Text>
      ) : (
        sessions.map((s, i) => {
          const selected = i === selectedIndex;
          const icon = s.attached ? "●" : "○";
          const color = s.attached ? "green" : "gray";
          // Find branch for this session by reverse-mapping session name
          const branch = Object.keys(prMap).find(
            (b) => branchToSessionName(b) === s.name
          );
          const pr = branch ? prMap[branch] : undefined;
          return (
            <Box key={s.name} flexDirection="column">
              <Text>
                <Text color={selected ? "cyan" : undefined}>
                  {selected ? "› " : "  "}
                </Text>
                <Text color={color}>{icon} </Text>
                <Text bold={selected}>{s.name}</Text>
              </Text>
              {adoConfigured ? <PrBadge pr={pr} /> : null}
            </Box>
          );
        })
      )}
      <Box marginTop={1}>
        <Text dimColor>
          n new · d kill · j/k · Tab · s cfg · q quit
        </Text>
      </Box>
    </Box>
  );
}

function TerminalView({
  content,
  focused,
}: {
  content: string;
  focused: boolean;
}) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor={focused ? "green" : "gray"}
      paddingX={1}
      overflow="hidden"
    >
      <Text bold color={focused ? "green" : "gray"}>
        Terminal {focused ? "(typing)" : "(view only)"}
      </Text>
      <Text dimColor>{"─".repeat(40)}</Text>
      <Text wrap="truncate">{content}</Text>
    </Box>
  );
}

function BranchPicker({
  filter,
  branches,
  selectedIndex,
}: {
  filter: string;
  branches: string[];
  selectedIndex: number;
}) {
  const filtered = branches.filter((b) =>
    b.toLowerCase().includes(filter.toLowerCase())
  );
  const hasExactMatch = branches.some(
    (b) => b.toLowerCase() === filter.toLowerCase()
  );

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      overflow="hidden"
    >
      <Text bold color="yellow">
        Branch Picker
      </Text>
      <Text dimColor>{"─".repeat(40)}</Text>
      {filtered.length === 0 ? (
        <Box flexDirection="column">
          {filter.length > 0 ? (
            <Text color="yellow">
              (new branch) <Text bold>{filter}</Text>
            </Text>
          ) : (
            <Text dimColor>Type to filter branches...</Text>
          )}
        </Box>
      ) : (
        <Box flexDirection="column">
          {filtered.map((b, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Text key={b}>
                <Text color={isSelected ? "cyan" : undefined}>
                  {isSelected ? "› " : "  "}
                </Text>
                <Text bold={isSelected}>{b}</Text>
              </Text>
            );
          })}
          {filter.length > 0 && !hasExactMatch && (
            <Box marginTop={1}>
              <Text dimColor>
                Enter to create: <Text color="yellow">{filter}</Text>
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// --- PR Data Hook ---

function usePrData(config: Config, refreshInterval = 60000) {
  const [prMap, setPrMap] = useState<BranchPrMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    if (!isAdoConfigured(config)) return;
    const adoConfig: AdoConfig = {
      org: config.org!,
      project: config.project!,
      repo: config.repo!,
      pat: config.pat!,
    };
    setLoading(true);
    fetchPullRequestsWithComments(adoConfig)
      .then((map) => {
        if (mountedRef.current) {
          setPrMap(map);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (mountedRef.current) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [config]);

  useEffect(() => {
    mountedRef.current = true;
    if (!isAdoConfigured(config)) return;
    refresh();
    const interval = setInterval(refresh, config.prPollInterval ?? refreshInterval);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [config, refresh, refreshInterval]);

  return { prMap, loading, error, refresh };
}

// --- PR Badge Component ---

function PrBadge({ pr }: { pr: PullRequestInfo | null | undefined }) {
  if (pr === null || pr === undefined) {
    return <Text dimColor>{"    (no PR)"}</Text>;
  }

  const approvedCount = pr.reviewers.filter((r) => r.vote >= 5).length;
  const totalReviewers = pr.reviewers.length;
  const hasRejected = pr.reviewers.some((r) => r.vote === -10);
  const hasWaiting = pr.reviewers.some((r) => r.vote === -5);

  let reviewColor: string;
  if (hasRejected) {
    reviewColor = "red";
  } else if (hasWaiting) {
    reviewColor = "yellow";
  } else if (totalReviewers > 0 && approvedCount === totalReviewers) {
    reviewColor = "green";
  } else {
    reviewColor = "gray";
  }

  const reviewText =
    totalReviewers > 0 ? `${approvedCount}/${totalReviewers} approved` : "";

  return (
    <Text>
      <Text dimColor>{"    "}</Text>
      {pr.isDraft ? (
        <Text dimColor>DRAFT </Text>
      ) : null}
      <Text color="blue">PR#{pr.pullRequestId}</Text>
      {reviewText ? (
        <Text color={reviewColor}>{`  ${reviewText}`}</Text>
      ) : null}
      {pr.activeCommentCount > 0 ? (
        <Text color="yellow">{`  ${pr.activeCommentCount} comment${pr.activeCommentCount !== 1 ? "s" : ""}`}</Text>
      ) : null}
    </Text>
  );
}

// --- Settings Panel ---

interface SettingsField {
  label: string;
  key: keyof Config;
  masked?: boolean;
}

const SETTINGS_FIELDS: SettingsField[] = [
  { label: "Organization", key: "org" },
  { label: "Project", key: "project" },
  { label: "Repository", key: "repo" },
  { label: "PAT", key: "pat", masked: true },
];

function SettingsPanel({
  config,
  fieldIndex,
  editingField,
  editBuffer,
}: {
  config: Config;
  fieldIndex: number;
  editingField: string | null;
  editBuffer: string;
}) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
    >
      <Text bold color="magenta">
        Azure DevOps Settings
      </Text>
      <Text dimColor>{"─".repeat(40)}</Text>
      {SETTINGS_FIELDS.map((field, i) => {
        const selected = i === fieldIndex;
        const isEditing = editingField === field.key;
        const rawValue = String(config[field.key] ?? "");
        const displayValue = field.masked && rawValue.length > 0
          ? "*".repeat(Math.min(rawValue.length, 20))
          : rawValue || "(not set)";

        return (
          <Text key={field.key}>
            <Text color={selected ? "cyan" : undefined}>
              {selected ? "› " : "  "}
            </Text>
            <Text bold={selected}>{field.label}: </Text>
            {isEditing ? (
              <Text color="cyan">
                {editBuffer}
                <Text dimColor>_</Text>
              </Text>
            ) : (
              <Text dimColor={!rawValue}>{displayValue}</Text>
            )}
          </Text>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>j/k nav · Enter edit · a auto-detect · Esc back</Text>
      </Box>
    </Box>
  );
}

// --- Control Mode Hook ---

function useControlMode(
  sessionName: string | null,
  paneCols: number,
  paneRows: number,
  setPaneContent: (content: string) => void
) {
  const connRef = useRef<ControlConnection | null>(null);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clamp capture-pane output to paneRows lines to prevent overflow
  const clampContent = useCallback(
    (raw: string) => {
      const lines = raw.split("\n");
      return lines.length > paneRows
        ? lines.slice(0, paneRows).join("\n")
        : raw;
    },
    [paneRows]
  );

  // Schedule a debounced capture-pane render
  const scheduleRender = useCallback(() => {
    if (renderTimer.current) return; // already scheduled
    renderTimer.current = setTimeout(() => {
      renderTimer.current = null;
      const conn = connRef.current;
      if (conn && conn.state === "ready") {
        conn.capturePane().then(
          (content) => {
            // Only update if this connection is still the active one
            if (connRef.current === conn) {
              setPaneContent(clampContent(content));
            }
          },
          () => {
            // Connection died between check and capture — ignore
          }
        );
      }
    }, 16); // ~60fps
  }, [setPaneContent, clampContent]);

  // Connect/disconnect only when session changes
  useEffect(() => {
    if (!sessionName) return;

    const conn = new ControlConnection(sessionName);
    connRef.current = conn;

    conn.on("output", () => {
      scheduleRender();
    });

    conn.on("exit", () => {
      setPaneContent("(session disconnected)");
    });

    conn.on("error", () => {
      setPaneContent("(connection error)");
    });

    conn
      .connect(paneCols, paneRows)
      .then(async () => {
        const content = await conn.capturePane();
        if (connRef.current === conn) {
          setPaneContent(clampContent(content));
        }
      })
      .catch(() => {
        setPaneContent("(failed to connect)");
      });

    return () => {
      if (renderTimer.current) {
        clearTimeout(renderTimer.current);
        renderTimer.current = null;
      }
      conn.disconnect();
      connRef.current = null;
    };
    // Only reconnect when the session changes — resize is handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionName]);

  // Resize the pane without reconnecting
  useEffect(() => {
    const conn = connRef.current;
    if (conn && conn.state === "ready") {
      conn.resize(paneCols, paneRows);
      scheduleRender();
    }
  }, [paneCols, paneRows, scheduleRender]);

  // Send input through the control connection
  const sendInput = useCallback(
    (input: string, key: Key) => {
      const conn = connRef.current;
      if (!conn || conn.state !== "ready") return;

      if (key.return) {
        conn.sendKeys("Enter");
      } else if (key.backspace || key.delete) {
        conn.sendKeys("BSpace");
      } else if (key.upArrow) {
        conn.sendKeys("Up");
      } else if (key.downArrow) {
        conn.sendKeys("Down");
      } else if (key.leftArrow) {
        conn.sendKeys("Left");
      } else if (key.rightArrow) {
        conn.sendKeys("Right");
      } else if (key.tab) {
        // Tab is reserved for focus switching, don't forward
      } else if (key.ctrl && input === "c") {
        conn.sendKeys("C-c");
      } else if (input) {
        conn.sendLiteral(input);
      }
    },
    []
  );

  return { sendInput };
}

// --- App ---

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;
  const termCols = stdout?.columns ?? 80;
  const [config, setConfig] = useState<Config>(() => readConfig());
  const adoConfigured = isAdoConfigured(config);
  const sidebarWidth = adoConfigured ? 48 : 24;
  const paneCols = Math.max(20, termCols - sidebarWidth - 4);
  const paneRows = Math.max(5, termRows - 5); // 2 border + 1 heading + 1 separator + 1 status bar
  const [focus, setFocus] = useState<Focus>("sidebar");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [paneContent, setPaneContent] = useState("(loading...)");
  const [hasTmux, setHasTmux] = useState(false);
  const [creating, setCreating] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [branchIndex, setBranchIndex] = useState(0);
  const [branches, setBranches] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ branch: string; sessionName: string; reason: string } | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFieldIndex, setSettingsFieldIndex] = useState(0);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState("");
  const { prMap, error: prError, refresh: refreshPr } = usePrData(config);

  const selectedSession = sessions[selectedIndex];
  const selectedName = selectedSession?.name ?? null;

  // Check tmux availability, load sessions and branches on mount
  useEffect(() => {
    const ok = isAvailable();
    setHasTmux(ok);
    if (ok) {
      setSessions(listSessions());
    }
    setBranches(listBranches());
    return () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    };
  }, []);

  // Refresh function used after create/kill
  const refreshSessions = () => {
    const updated = listSessions();
    setSessions(updated);
    return updated;
  };

  // Show a temporary status message for 3 seconds
  const flashStatus = (msg: string) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatusMessage(msg);
    statusTimer.current = setTimeout(() => setStatusMessage(null), 3000);
  };

  // Perform the actual session + worktree + branch deletion
  const performDelete = (sessionName: string, branch: string) => {
    killSession(sessionName);
    removeWorktree(branch);
    try {
      execSync(`git branch -d "${branch}"`, { stdio: "pipe" });
    } catch {
      // Branch delete may fail if not fully merged — that's ok, worktree is gone
    }
    const updated = refreshSessions();
    setSelectedIndex((prev) =>
      prev >= updated.length ? Math.max(0, updated.length - 1) : prev
    );
  };

  // Control mode connection for selected session
  const { sendInput } = useControlMode(
    hasTmux ? selectedName : null,
    paneCols,
    paneRows,
    setPaneContent
  );

  useInput((input, key) => {
    // Branch picker mode
    if (creating) {
      if (key.escape) {
        setCreating(false);
        setBranchFilter("");
        setBranchIndex(0);
        return;
      }

      const filtered = branches.filter((b) =>
        b.toLowerCase().includes(branchFilter.toLowerCase())
      );

      if (key.upArrow) {
        setBranchIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (key.downArrow) {
        setBranchIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }

      if (key.return) {
        // Pick the selected branch, or use typed text as new branch name
        const branch =
          filtered.length > 0 ? filtered[branchIndex]! : branchFilter.trim();
        if (branch) {
          const worktreePath = createWorktree(branch);
          if (worktreePath) {
            const sessionName = branchToSessionName(branch);
            createSession(sessionName, paneCols, paneRows, "claude", worktreePath);
            const updated = refreshSessions();
            const idx = updated.findIndex((s) => s.name === sessionName);
            if (idx >= 0) setSelectedIndex(idx);
          }
        }
        setCreating(false);
        setBranchFilter("");
        setBranchIndex(0);
        return;
      }

      if (key.backspace || key.delete) {
        setBranchFilter((f) => f.slice(0, -1));
        setBranchIndex(0);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setBranchFilter((f) => f + input);
        setBranchIndex(0);
      }
      return;
    }

    // Confirm delete mode — user must type branch name to proceed
    if (confirmDelete) {
      if (key.escape) {
        setConfirmDelete(null);
        setConfirmInput("");
        return;
      }
      if (key.return) {
        if (confirmInput === confirmDelete.branch) {
          performDelete(confirmDelete.sessionName, confirmDelete.branch);
        } else {
          flashStatus("Branch name did not match — delete cancelled");
        }
        setConfirmDelete(null);
        setConfirmInput("");
        return;
      }
      if (key.backspace || key.delete) {
        setConfirmInput((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setConfirmInput((v) => v + input);
      }
      return;
    }

    // Settings mode
    if (settingsOpen) {
      if (editingField) {
        if (key.escape) {
          setEditingField(null);
          setEditBuffer("");
          return;
        }
        if (key.return) {
          const field = SETTINGS_FIELDS[settingsFieldIndex]!;
          const newConfig = { ...config, [field.key]: editBuffer || undefined };
          setConfig(newConfig);
          writeConfig(newConfig);
          setEditingField(null);
          setEditBuffer("");
          return;
        }
        if (key.backspace || key.delete) {
          setEditBuffer((v) => v.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setEditBuffer((v) => v + input);
        }
        return;
      }

      if (key.escape) {
        setSettingsOpen(false);
        return;
      }
      if (input === "j" || key.downArrow) {
        setSettingsFieldIndex((i) =>
          Math.min(i + 1, SETTINGS_FIELDS.length - 1)
        );
        return;
      }
      if (input === "k" || key.upArrow) {
        setSettingsFieldIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (key.return) {
        const field = SETTINGS_FIELDS[settingsFieldIndex]!;
        setEditingField(field.key);
        setEditBuffer(String(config[field.key] ?? ""));
        return;
      }
      if (input === "a") {
        try {
          const remoteUrl = execSync("git remote get-url origin", {
            encoding: "utf8",
            stdio: "pipe",
          }).trim();
          const parsed = parseAdoRemoteUrl(remoteUrl);
          if (parsed) {
            const newConfig = {
              ...config,
              org: parsed.org,
              project: parsed.project,
              repo: parsed.repo,
            };
            setConfig(newConfig);
            writeConfig(newConfig);
            flashStatus("Auto-detected org/project/repo from git remote");
          } else {
            flashStatus("Could not parse Azure DevOps URL from git remote");
          }
        } catch {
          flashStatus("Failed to read git remote");
        }
        return;
      }
      return;
    }

    // Tab switches focus
    if (key.tab) {
      setFocus((f) => (f === "sidebar" ? "terminal" : "sidebar"));
      return;
    }

    // Escape returns to sidebar
    if (key.escape) {
      if (focus === "terminal") {
        setFocus("sidebar");
        return;
      }
    }

    if (focus === "sidebar") {
      if (input === "q") {
        exit();
        return;
      }
      if (input === "n") {
        setBranches(listBranches());
        setCreating(true);
        setBranchFilter("");
        setBranchIndex(0);
        return;
      }
      if (input === "d" && selectedSession) {
        const sessionName = selectedSession.name;
        const currentBranches = listBranches();
        const branch = currentBranches.find(
          (b) => branchToSessionName(b) === sessionName
        );
        if (branch) {
          const check = canRemoveBranch(branch);
          if (!check.safe) {
            if (check.reason === "not pushed to upstream" || check.reason === "uncommitted changes") {
              // Ask user to type branch name to confirm
              setConfirmDelete({ branch, sessionName, reason: check.reason });
              setConfirmInput("");
            } else {
              flashStatus(`Cannot delete: ${check.reason}`);
            }
            return;
          }
          performDelete(sessionName, branch);
        } else {
          // No matching branch found — just kill the session
          killSession(sessionName);
          const updated = refreshSessions();
          if (selectedIndex >= updated.length) {
            setSelectedIndex(Math.max(0, updated.length - 1));
          }
        }
        return;
      }
      if (input === "s") {
        setSettingsOpen(true);
        setSettingsFieldIndex(0);
        return;
      }
      if (input === "r") {
        refreshPr();
        flashStatus("Refreshing PR data...");
        return;
      }
      if (input === "j" || key.downArrow) {
        setSelectedIndex((i) => Math.min(i + 1, sessions.length - 1));
      }
      if (input === "k" || key.upArrow) {
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
    } else {
      // Terminal focused — forward input via control mode
      sendInput(input, key);
    }
  });

  return (
    <Box flexDirection="column" height={termRows}>
      <Box flexGrow={1}>
        <Sidebar
          sessions={sessions}
          selectedIndex={selectedIndex}
          focused={focus === "sidebar" && !creating && !settingsOpen}
          prMap={prMap}
          adoConfigured={adoConfigured}
          sidebarWidth={sidebarWidth}
        />
        {settingsOpen ? (
          <SettingsPanel
            config={config}
            fieldIndex={settingsFieldIndex}
            editingField={editingField}
            editBuffer={editBuffer}
          />
        ) : creating ? (
          <BranchPicker
            filter={branchFilter}
            branches={branches}
            selectedIndex={branchIndex}
          />
        ) : (
          <TerminalView
            content={hasTmux ? paneContent : "(tmux not available)"}
            focused={focus === "terminal"}
          />
        )}
      </Box>
      <Box paddingX={1}>
        {confirmDelete ? (
          <Text>
            <Text color="red">Warning: {confirmDelete.reason}. Type </Text>
            <Text bold color="yellow">{confirmDelete.branch}</Text>
            <Text color="red"> to confirm: </Text>
            <Text color="cyan">{confirmInput}</Text>
            <Text dimColor>_</Text>
            <Text dimColor> · Esc cancel</Text>
          </Text>
        ) : creating ? (
          <Text>
            Branch: <Text color="cyan">{branchFilter}</Text>
            <Text dimColor>_</Text>
            <Text dimColor> · Enter select · Esc cancel</Text>
          </Text>
        ) : statusMessage ? (
          <Text color="yellow">{statusMessage}</Text>
        ) : prError ? (
          <Text color="red">PR error: {prError}</Text>
        ) : (
          <Text dimColor>
            workflow-manager · {sessions.length} sessions ·{" "}
            focus: <Text color="cyan">{focus}</Text> · tmux:{" "}
            {hasTmux ? "✓" : "✕"}
            {!adoConfigured ? " · (s to configure ADO)" : ""}
          </Text>
        )}
      </Box>
    </Box>
  );
}

render(<App />);
