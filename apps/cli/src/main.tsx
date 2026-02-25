import React, { useState, useEffect } from "react";
import { render, Text, Box, useInput, useApp, useStdout } from "ink";
import { execSync } from "node:child_process";

// --- Mock data ---
const MOCK_SESSIONS = [
  { name: "feat-auth", status: "running" as const },
  { name: "fix-123", status: "idle" as const },
  { name: "refactor-api", status: "waiting" as const },
  { name: "chore-deps", status: "stopped" as const },
];

const STATUS_ICONS: Record<string, string> = {
  running: "●",
  idle: "○",
  waiting: "◐",
  stopped: "✕",
};

const STATUS_COLORS: Record<string, string> = {
  running: "green",
  idle: "gray",
  waiting: "yellow",
  stopped: "red",
};

// --- tmux pane capture ---
const DEMO_SESSION = "wm-demo";

function ensureDemoSession(cols: number, rows: number): boolean {
  try {
    execSync(`tmux has-session -t ${DEMO_SESSION}`, { stdio: "ignore" });
    // Resize existing session to match terminal
    execSync(`tmux resize-window -t ${DEMO_SESSION} -x ${cols} -y ${rows}`, { stdio: "ignore" });
    return true;
  } catch {
    try {
      execSync(
        `tmux new-session -d -s ${DEMO_SESSION} -x ${cols} -y ${rows}`,
        { stdio: "ignore" }
      );
      return true;
    } catch {
      return false;
    }
  }
}

function captureDemo(): string {
  try {
    return execSync(`tmux capture-pane -t ${DEMO_SESSION} -p -e`, {
      encoding: "utf8",
    });
  } catch {
    return "(no tmux session)";
  }
}

// --- Components ---

type Focus = "sidebar" | "terminal";

function Sidebar({
  sessions,
  selectedIndex,
  focused,
}: {
  sessions: typeof MOCK_SESSIONS;
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
      {sessions.map((s, i) => {
        const selected = i === selectedIndex;
        const icon = STATUS_ICONS[s.status] ?? "?";
        const color = STATUS_COLORS[s.status] ?? "white";
        return (
          <Text key={s.name}>
            <Text color={selected ? "cyan" : undefined}>
              {selected ? "› " : "  "}
            </Text>
            <Text color={color}>{icon} </Text>
            <Text bold={selected}>{s.name}</Text>
          </Text>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>j/k nav · Tab focus · q quit</Text>
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
    >
      <Text bold color={focused ? "green" : "gray"}>
        Terminal {focused ? "(typing)" : "(view only)"}
      </Text>
      <Text dimColor>{"─".repeat(40)}</Text>
      <Text>{content}</Text>
    </Box>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sendToDemo(input: string, key: any): void {
  try {
    if (key.return) {
      execSync(`tmux send-keys -t ${DEMO_SESSION} Enter`);
    } else if (key.backspace || key.delete) {
      execSync(`tmux send-keys -t ${DEMO_SESSION} BSpace`);
    } else if (key.upArrow) {
      execSync(`tmux send-keys -t ${DEMO_SESSION} Up`);
    } else if (key.downArrow) {
      execSync(`tmux send-keys -t ${DEMO_SESSION} Down`);
    } else if (key.leftArrow) {
      execSync(`tmux send-keys -t ${DEMO_SESSION} Left`);
    } else if (key.rightArrow) {
      execSync(`tmux send-keys -t ${DEMO_SESSION} Right`);
    } else if (key.tab) {
      // Tab is reserved for focus switching, don't forward
    } else if (key.ctrl && input === "c") {
      execSync(`tmux send-keys -t ${DEMO_SESSION} C-c`);
    } else if (input) {
      execSync(`tmux send-keys -t ${DEMO_SESSION} -l -- ${JSON.stringify(input)}`);
    }
  } catch {
    // ignore send failures
  }
}

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;
  const termCols = stdout?.columns ?? 80;
  const sidebarWidth = 26; // 24 content + 2 border
  const paneRows = Math.max(5, termRows - 4); // borders + status bar
  const paneCols = Math.max(20, termCols - sidebarWidth - 4); // borders + padding
  const [focus, setFocus] = useState<Focus>("sidebar");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [paneContent, setPaneContent] = useState("(loading...)");
  const [hasTmux, setHasTmux] = useState(false);

  useEffect(() => {
    const ok = ensureDemoSession(paneCols, paneRows);
    setHasTmux(ok);
    if (ok) {
      setPaneContent(captureDemo());
      const interval = setInterval(() => {
        setPaneContent(captureDemo());
      }, 500);
      return () => clearInterval(interval);
    }
    return undefined;
  }, []);

  useInput((input, key) => {
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
      if (input === "j" || key.downArrow) {
        setSelectedIndex((i) => Math.min(i + 1, MOCK_SESSIONS.length - 1));
      }
      if (input === "k" || key.upArrow) {
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
    } else {
      // Terminal focused — forward input to tmux
      sendToDemo(input, key);
    }
  });

  return (
    <Box flexDirection="column" height={termRows}>
      <Box flexGrow={1}>
        <Sidebar
          sessions={MOCK_SESSIONS}
          selectedIndex={selectedIndex}
          focused={focus === "sidebar"}
        />
        <TerminalView
          content={hasTmux ? paneContent : "(tmux not available)"}
          focused={focus === "terminal"}
        />
      </Box>
      <Box paddingX={1}>
        <Text dimColor>
          workflow-manager · {MOCK_SESSIONS.length} sessions ·{" "}
          focus: <Text color="cyan">{focus}</Text> · tmux:{" "}
          {hasTmux ? "✓" : "✕"}
        </Text>
      </Box>
    </Box>
  );
}

render(<App />);
