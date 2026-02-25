/**
 * SPIKE: Input forwarding latency test
 *
 * 1. Create tmux session running `cat` (echoes stdin)
 * 2. Ink useInput captures keystrokes
 * 3. Forward each keystroke via tmux send-keys
 * 4. Poll capture-pane and render
 * 5. Test special keys: Enter, Ctrl+C, arrows, Tab
 */
import React, { useState, useEffect, useCallback } from "react";
import { render, Text, Box, useInput, useApp } from "ink";
import { execSync } from "node:child_process";

const SESSION_NAME = "wm-spike-input";

function setup(): void {
  try {
    execSync(`tmux kill-session -t ${SESSION_NAME}`, { stdio: "ignore" });
  } catch {
    // ignore
  }
  execSync(
    `tmux new-session -d -s ${SESSION_NAME} -x 80 -y 12 'cat'`
  );
  execSync("sleep 0.3");
}

function capture(): string {
  try {
    return execSync(`tmux capture-pane -t ${SESSION_NAME} -p -e`, {
      encoding: "utf8",
    });
  } catch {
    return "(capture failed)";
  }
}

function sendKeys(keys: string): void {
  try {
    execSync(`tmux send-keys -t ${SESSION_NAME} ${keys}`);
  } catch {
    // ignore
  }
}

function sendLiteral(text: string): void {
  try {
    // -l flag sends literal text (no key name interpretation)
    execSync(`tmux send-keys -t ${SESSION_NAME} -l -- ${JSON.stringify(text)}`);
  } catch {
    // ignore
  }
}

function cleanup(): void {
  try {
    execSync(`tmux kill-session -t ${SESSION_NAME}`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}

function App() {
  const { exit } = useApp();
  const [paneContent, setPaneContent] = useState("");
  const [lastKey, setLastKey] = useState("(none)");
  const [keyCount, setKeyCount] = useState(0);

  useEffect(() => {
    setup();
    // Poll capture-pane every 200ms
    const interval = setInterval(() => {
      setPaneContent(capture());
    }, 200);
    return () => {
      clearInterval(interval);
      cleanup();
    };
  }, []);

  useInput(
    useCallback(
      (input: string, key) => {
        setKeyCount((c) => c + 1);

        if (key.escape) {
          setLastKey("Escape (exiting)");
          cleanup();
          exit();
          return;
        }

        if (key.return) {
          setLastKey("Enter");
          sendKeys("Enter");
        } else if (key.tab) {
          setLastKey("Tab");
          sendKeys("Tab");
        } else if (key.backspace || key.delete) {
          setLastKey("Backspace");
          sendKeys("BSpace");
        } else if (key.upArrow) {
          setLastKey("Up");
          sendKeys("Up");
        } else if (key.downArrow) {
          setLastKey("Down");
          sendKeys("Down");
        } else if (key.leftArrow) {
          setLastKey("Left");
          sendKeys("Left");
        } else if (key.rightArrow) {
          setLastKey("Right");
          sendKeys("Right");
        } else if (key.ctrl && input === "c") {
          setLastKey("Ctrl+C");
          sendKeys("C-c");
        } else if (input) {
          setLastKey(`char: "${input}"`);
          sendLiteral(input);
        }
      },
      []
    )
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>
        SPIKE: Input Forwarding Test
      </Text>
      <Text dimColor>
        Type characters — they forward to tmux session running `cat`.
      </Text>
      <Text dimColor>Press Escape to exit.</Text>
      <Text>
        Last key: <Text color="yellow">{lastKey}</Text> | Total keys:{" "}
        <Text color="cyan">{keyCount}</Text>
      </Text>

      <Box
        borderStyle="round"
        borderColor="green"
        padding={1}
        marginTop={1}
        height={14}
      >
        <Text>{paneContent}</Text>
      </Box>
    </Box>
  );
}

render(<App />);
