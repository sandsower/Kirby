/**
 * Screen buffer backed by xterm-headless.
 *
 * Receives raw terminal output (from tmux %output events), feeds it into
 * a headless xterm Terminal, and serializes the visible screen content
 * as an ANSI-encoded string suitable for Ink's <Text> component.
 */
import xterm from "@xterm/headless";
const { Terminal } = xterm;
import { SerializeAddon } from "@xterm/addon-serialize";

export class ScreenBuffer {
  private terminal: InstanceType<typeof Terminal>;
  private serializer: SerializeAddon;
  private dirty = false;
  private cachedContent = "";

  constructor(cols: number, rows: number) {
    this.terminal = new Terminal({
      cols,
      rows,
      allowProposedApi: true,
      scrollback: 0,
    });
    this.serializer = new SerializeAddon();
    this.terminal.loadAddon(this.serializer);
  }

  /**
   * Write raw terminal data (already unescaped from tmux %output).
   */
  write(data: string): void {
    this.terminal.write(data);
    this.dirty = true;
  }

  /**
   * Write data and wait for it to be processed by the terminal parser.
   */
  writeSync(data: string): Promise<void> {
    return new Promise((resolve) => {
      this.terminal.write(data, resolve);
      this.dirty = true;
    });
  }

  /**
   * Resize the virtual terminal.
   */
  resize(cols: number, rows: number): void {
    this.terminal.resize(cols, rows);
    this.dirty = true;
  }

  /**
   * Serialize the current viewport as an ANSI string.
   * Results are cached until new data is written.
   */
  serialize(): string {
    if (!this.dirty && this.cachedContent) {
      return this.cachedContent;
    }
    this.cachedContent = this.serializer.serialize({
      scrollback: 0,
      excludeModes: true,
      excludeAltBuffer: false,
    });
    this.dirty = false;
    return this.cachedContent;
  }

  /**
   * Get plain text content (no ANSI codes) from the buffer.
   * Useful for testing.
   */
  getText(): string {
    const buf = this.terminal.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < this.terminal.rows; i++) {
      const line = buf.getLine(i);
      lines.push(line ? line.translateToString(true) : "");
    }
    return lines.join("\n");
  }

  get cols(): number {
    return this.terminal.cols;
  }

  get rows(): number {
    return this.terminal.rows;
  }

  dispose(): void {
    this.serializer.dispose();
    this.terminal.dispose();
  }
}
