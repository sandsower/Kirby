/**
 * Tmux control mode connection.
 *
 * Spawns `tmux -C attach-session -t <session>` and maintains a persistent
 * connection over stdin/stdout. Parses the control mode protocol and exposes
 * an EventEmitter API for output notifications and command responses.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

// --- Protocol types ---

export interface OutputEvent {
  paneId: string;
  data: string;
}

export interface CommandResponse {
  cmdNumber: number;
  output: string;
  error: boolean;
}

export interface ControlConnectionEvents {
  output: [OutputEvent];
  exit: [string | undefined];
  error: [Error];
  ready: [];
  "sessions-changed": [];
  "session-changed": [{ id: string; name: string }];
}

// --- Escaping ---

/**
 * Unescape tmux control mode octal encoding.
 * Characters with ASCII < 32 and backslash are encoded as \NNN (3-digit octal).
 */
export function unescapeOutput(escaped: string): string {
  return escaped.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(parseInt(octal, 8))
  );
}

// --- Connection ---

export type ControlConnectionState =
  | "disconnected"
  | "connecting"
  | "ready"
  | "closed";

export class ControlConnection extends EventEmitter<ControlConnectionEvents> {
  private proc: ChildProcess | null = null;
  private rl: ReadlineInterface | null = null;
  private _state: ControlConnectionState = "disconnected";
  private pendingCommands: Map<
    number,
    { resolve: (resp: CommandResponse) => void; output: string[] }
  > = new Map();
  private currentBlock: {
    cmdNumber: number;
    lines: string[];
  } | null = null;
  private _sessionName: string;
  private _paneId: string | null = null;

  constructor(sessionName: string) {
    super();
    this._sessionName = sessionName;
  }

  get state(): ControlConnectionState {
    return this._state;
  }

  get sessionName(): string {
    return this._sessionName;
  }

  get paneId(): string | null {
    return this._paneId;
  }

  /**
   * Connect to the tmux session in control mode.
   * Resolves when the initial %begin/%end handshake completes.
   */
  connect(cols: number, rows: number): Promise<void> {
    if (this._state !== "disconnected") {
      return Promise.reject(new Error(`Cannot connect: state is ${this._state}`));
    }
    this._state = "connecting";

    return new Promise((resolve, reject) => {
      this.proc = spawn("tmux", ["-C", "attach-session", "-t", this._sessionName], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.proc.stdin!.on("error", () => {
        // Absorb EPIPE / write errors on dead stdin — the "exit" handler manages cleanup
      });

      this.proc.on("error", (err) => {
        this._state = "closed";
        reject(err);
        this.emit("error", err);
      });

      this.proc.on("exit", () => {
        this._state = "closed";
        this.cleanup();
        this.emit("exit", undefined);
      });

      this.rl = createInterface({ input: this.proc.stdout! });

      let gotInitialEnd = false;

      this.rl.on("line", (line) => {
        // During initial handshake, wait for the first %end
        if (!gotInitialEnd) {
          if (line.startsWith("%end ") || line.startsWith("%error ")) {
            gotInitialEnd = true;
            this._state = "ready";
            // Set client size immediately
            this.sendCommand(`refresh-client -C ${cols}x${rows}`).then(() => {
              this.emit("ready");
              resolve();
            });
          }
          return;
        }

        this.parseLine(line);
      });

      this.rl.on("close", () => {
        this._state = "closed";
        this.cleanup();
      });
    });
  }

  /**
   * Send a tmux command and get the response.
   */
  sendCommand(command: string): Promise<CommandResponse> {
    if (this._state !== "ready" || !this.proc?.stdin?.writable) {
      return Promise.reject(new Error("Not connected"));
    }

    return new Promise((resolve) => {
      // We'll match by the next %begin we see that isn't already tracked.
      // Commands are processed in order, so we use a queue approach.
      const marker = { resolve, output: [] as string[] };
      // We store with key -1 as a "pending" marker; parseLine will assign the real cmdNumber.
      this.pendingCommands.set(-Date.now(), marker);
      this.proc!.stdin!.write(command + "\n");
    });
  }

  /**
   * Send keys to the session's active pane via control mode stdin.
   * This is much faster than spawning a separate process.
   */
  sendKeys(keys: string): void {
    if (this._state !== "ready" || !this.proc?.stdin?.writable) return;
    const target = this._paneId ?? this._sessionName;
    this.proc.stdin.write(`send-keys -t ${target} ${keys}\n`);
  }

  /**
   * Send literal text to the session's active pane.
   */
  sendLiteral(text: string): void {
    if (this._state !== "ready" || !this.proc?.stdin?.writable) return;
    const target = this._paneId ?? this._sessionName;
    // Escape single quotes by ending the quote, adding escaped quote, starting new quote
    const escaped = text.replace(/'/g, "'\\''");
    this.proc.stdin.write(`send-keys -t ${target} -l -- '${escaped}'\n`);
  }

  /**
   * Resize the control client (and thus the session's windows).
   */
  resize(cols: number, rows: number): void {
    if (this._state !== "ready" || !this.proc?.stdin?.writable) return;
    this.proc.stdin.write(`refresh-client -C ${cols}x${rows}\n`);
  }

  /**
   * Capture the current pane content (synchronous snapshot via command response).
   */
  async capturePane(): Promise<string> {
    const target = this._paneId ?? this._sessionName;
    const resp = await this.sendCommand(`capture-pane -t ${target} -p -e`);
    return resp.output;
  }

  /**
   * Disconnect from the control mode session.
   */
  disconnect(): void {
    if (this.proc) {
      // Sending an empty line causes tmux control client to detach
      if (this.proc.stdin?.writable) {
        this.proc.stdin.write("\n");
      }
      this.proc.kill();
    }
    this.cleanup();
    this._state = "closed";
  }

  private cleanup(): void {
    this.rl?.close();
    this.rl = null;
    this.proc = null;
    this.pendingCommands.clear();
    this.currentBlock = null;
  }

  private parseLine(line: string): void {
    // Inside a command response block, collect lines
    if (this.currentBlock !== null) {
      const endMatch = line.match(/^%(end|error) (\d+) (\d+) (\d+)$/);
      if (endMatch) {
        const cmdNumber = parseInt(endMatch[3]!, 10);
        if (cmdNumber === this.currentBlock.cmdNumber) {
          const isError = endMatch[1] === "error";
          const output = this.currentBlock.lines.join("\n");
          this.currentBlock = null;

          // Find the oldest pending command and resolve it
          const pendingKey = this.findOldestPending();
          if (pendingKey !== null) {
            const pending = this.pendingCommands.get(pendingKey)!;
            this.pendingCommands.delete(pendingKey);
            pending.resolve({ cmdNumber, output, error: isError });
          }
          return;
        }
      }
      // Regular output line within a block
      this.currentBlock.lines.push(line);
      return;
    }

    // %begin starts a new response block
    const beginMatch = line.match(/^%begin (\d+) (\d+) (\d+)$/);
    if (beginMatch) {
      this.currentBlock = {
        cmdNumber: parseInt(beginMatch[2]!, 10),
        lines: [],
      };
      return;
    }

    // %output notification
    const outputMatch = line.match(/^%output (%\d+) (.*)$/);
    if (outputMatch) {
      const paneId = outputMatch[1]!;
      if (!this._paneId) {
        this._paneId = paneId;
      }
      const data = unescapeOutput(outputMatch[2]!);
      this.emit("output", { paneId, data });
      return;
    }

    // %session-changed notification
    const sessionMatch = line.match(/^%session-changed \$(\d+) (.+)$/);
    if (sessionMatch) {
      this.emit("session-changed", {
        id: `$${sessionMatch[1]}`,
        name: sessionMatch[2]!,
      });
      return;
    }

    // %sessions-changed notification
    if (line === "%sessions-changed") {
      this.emit("sessions-changed");
      return;
    }

    // %exit notification
    const exitMatch = line.match(/^%exit\s*(.*)$/);
    if (exitMatch) {
      this._state = "closed";
      this.emit("exit", exitMatch[1] || undefined);
      return;
    }

    // Other notifications are silently ignored for now
  }

  private findOldestPending(): number | null {
    // Negative keys are "unmatched" pending commands. Return the one with the
    // largest magnitude negative (oldest Date.now(), which is most negative).
    let oldest: number | null = null;
    for (const key of this.pendingCommands.keys()) {
      if (key < 0) {
        if (oldest === null || key < oldest) {
          oldest = key;
        }
      }
    }
    return oldest;
  }
}
