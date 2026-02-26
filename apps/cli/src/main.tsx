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

// --- Components ---

type Focus = "sidebar" | "terminal";

function Sidebar({
  sessions,
  selectedIndex,
  focused,
}: {
  sessions: TmuxSession[];
  selectedIndex: number;
  focused: boolean;
}) {
  return (
    <Box
      flexDirection="column"
      width={24}
      borderStyle="round"
      borderColor={focused ? "blue" : "gray"}
      paddingX={1}
    >
      <Text bold color={focused ? "blue" : "gray"}>
        Sessions
      </Text>
      <Text dimColor>{"─".repeat(20)}</Text>
      {sessions.length === 0 ? (
        <Text dimColor>(no sessions)</Text>
      ) : (
        sessions.map((s, i) => {
          const selected = i === selectedIndex;
          const icon = s.attached ? "●" : "○";
          const color = s.attached ? "green" : "gray";
          return (
            <Text key={s.name}>
              <Text color={selected ? "cyan" : undefined}>
                {selected ? "› " : "  "}
              </Text>
              <Text color={color}>{icon} </Text>
              <Text bold={selected}>{s.name}</Text>
            </Text>
          );
        })
      )}
      <Box marginTop={1}>
        <Text dimColor>n new · d kill · j/k nav · Tab focus · q quit</Text>
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
  const sidebarWidth = 24; // Ink width includes border
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
          focused={focus === "sidebar" && !creating}
        />
        {creating ? (
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
          <Text color="red">{statusMessage}</Text>
        ) : (
          <Text dimColor>
            workflow-manager · {sessions.length} sessions ·{" "}
            focus: <Text color="cyan">{focus}</Text> · tmux:{" "}
            {hasTmux ? "✓" : "✕"}
          </Text>
        )}
      </Box>
    </Box>
  );
}

render(<App />);
