import { describe, it, expect } from "vitest";
import { unescapeOutput } from "./control-connection.js";

describe("unescapeOutput", () => {
  it("passes through plain text unchanged", () => {
    expect(unescapeOutput("hello world")).toBe("hello world");
  });

  it("unescapes newline (\\012)", () => {
    expect(unescapeOutput("line1\\012line2")).toBe("line1\nline2");
  });

  it("unescapes carriage return (\\015)", () => {
    expect(unescapeOutput("hello\\015")).toBe("hello\r");
  });

  it("unescapes tab (\\011)", () => {
    expect(unescapeOutput("col1\\011col2")).toBe("col1\tcol2");
  });

  it("unescapes ESC (\\033)", () => {
    expect(unescapeOutput("\\033[32mgreen\\033[0m")).toBe("\x1b[32mgreen\x1b[0m");
  });

  it("unescapes backslash (\\134)", () => {
    expect(unescapeOutput("path\\134file")).toBe("path\\file");
  });

  it("unescapes null byte (\\000)", () => {
    expect(unescapeOutput("a\\000b")).toBe("a\x00b");
  });

  it("handles multiple escapes in sequence", () => {
    expect(unescapeOutput("\\015\\012")).toBe("\r\n");
  });

  it("handles mixed escaped and literal text", () => {
    const input = "\\033[1mbold\\033[0m normal \\033[31mred\\033[0m";
    const expected = "\x1b[1mbold\x1b[0m normal \x1b[31mred\x1b[0m";
    expect(unescapeOutput(input)).toBe(expected);
  });

  it("handles backslash followed by non-octal (literal backslash)", () => {
    // Only 3-digit octal sequences are escaped, e.g. \134 for backslash
    expect(unescapeOutput("\\134n")).toBe("\\n");
  });

  it("handles empty string", () => {
    expect(unescapeOutput("")).toBe("");
  });

  it("handles UTF-8 passthrough (chars >= 0x80 are not escaped)", () => {
    expect(unescapeOutput("héllo wörld")).toBe("héllo wörld");
  });

  it("unescapes real tmux output: echo command with prompt", () => {
    // Real tmux output: `e\010echo h` (backspace then "echo h")
    const input = "e\\010echo h";
    expect(unescapeOutput(input)).toBe("e\becho h");
  });
});
