/**
 * SPIKE: Can Ink <Text> render raw ANSI from tmux capture-pane -e?
 *
 * Steps:
 * 1. Create a temp tmux session that outputs colored text
 * 2. capture-pane -p -e to get ANSI output
 * 3. Render inside Ink <Text>
 * 4. Observe if colors display correctly
 */
import React, { useState, useEffect } from "react";
import { render, Text, Box } from "ink";
import { execSync } from "node:child_process";

const SESSION_NAME = "wm-spike-ansi";

function setup(): void {
  // Kill any leftover session
  try {
    execSync(`tmux kill-session -t ${SESSION_NAME}`, { stdio: "ignore" });
  } catch {
    // ignore
  }

  // Create a detached session that outputs colored text
  execSync(
    `tmux new-session -d -s ${SESSION_NAME} -x 80 -y 24 'echo -e "\\033[31mRED\\033[0m \\033[32mGREEN\\033[0m \\033[34mBLUE\\033[0m \\033[1;33mBOLD YELLOW\\033[0m"; echo "Plain text"; echo -e "\\033[4;35mUnderlined Magenta\\033[0m"; sleep 30'`
  );

  // Give the shell a moment to render
  execSync("sleep 0.5");
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

function cleanup(): void {
  try {
    execSync(`tmux kill-session -t ${SESSION_NAME}`, { stdio: "ignore" });
  } catch {
    // ignore
  }
}

function App() {
  const [paneContent, setPaneContent] = useState("(loading...)");
  const [rawBytes, setRawBytes] = useState("");

  useEffect(() => {
    setup();
    const content = capture();
    setPaneContent(content);
    // Show first 200 chars as escaped string for debugging
    setRawBytes(
      JSON.stringify(content.slice(0, 300))
    );
    cleanup();
  }, []);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>
        SPIKE: Ink ANSI Rendering Test
      </Text>
      <Text dimColor>
        Below is raw capture-pane -e output rendered in {"<Text>"}:
      </Text>
      <Box borderStyle="round" borderColor="cyan" padding={1} marginTop={1}>
        <Text>{paneContent}</Text>
      </Box>
      <Text dimColor marginTop={1}>
        Raw bytes (first 300 chars):
      </Text>
      <Text>{rawBytes}</Text>
    </Box>
  );
}

render(<App />);
