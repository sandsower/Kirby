import React, { useState, useEffect } from "react";
import { render, Text, Box, useInput, useApp } from "ink";
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

function ensureDemoSession(): boolean {
  try {
    execSync(`tmux has-session -t ${DEMO_SESSION}`, { stdio: "ignore" });
    return true;
  } catch {
    try {
      execSync(
        `tmux new-session -d -s ${DEMO_SESSION} -x 80 -y 20`,
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

function Sidebar({
  sessions,
  selectedIndex,
}: {
  sessions: typeof MOCK_SESSIONS;
  selectedIndex: number;
}) {
  return (
    <Box
      flexDirection="column"
      width={24}
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
    >
      <Text bold color="blue">
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
        <Text dimColor>j/k nav · q quit</Text>
      </Box>
    </Box>
  );
}

function TerminalView({ content }: { content: string }) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor="green"
      paddingX={1}
    >
      <Text bold color="green">
        Terminal
      </Text>
      <Text dimColor>{"─".repeat(40)}</Text>
      <Text>{content}</Text>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [paneContent, setPaneContent] = useState("(loading...)");
  const [hasTmux, setHasTmux] = useState(false);

  useEffect(() => {
    const ok = ensureDemoSession();
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
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Sidebar sessions={MOCK_SESSIONS} selectedIndex={selectedIndex} />
        <TerminalView
          content={hasTmux ? paneContent : "(tmux not available)"}
        />
      </Box>
      <Box paddingX={1}>
        <Text dimColor>
          workflow-manager · {MOCK_SESSIONS.length} sessions · tmux:{" "}
          {hasTmux ? "✓" : "✕"}
        </Text>
      </Box>
    </Box>
  );
}

render(<App />);
