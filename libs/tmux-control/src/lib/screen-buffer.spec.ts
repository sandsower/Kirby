import { describe, it, expect } from "vitest";
import { ScreenBuffer } from "./screen-buffer.js";

describe("ScreenBuffer", () => {
  it("creates with specified dimensions", () => {
    const buf = new ScreenBuffer(80, 24);
    expect(buf.cols).toBe(80);
    expect(buf.rows).toBe(24);
    buf.dispose();
  });

  it("writes and reads plain text", async () => {
    const buf = new ScreenBuffer(40, 5);
    await buf.writeSync("hello world");
    expect(buf.getText()).toContain("hello world");
    buf.dispose();
  });

  it("handles newlines", async () => {
    const buf = new ScreenBuffer(40, 5);
    await buf.writeSync("line1\r\nline2\r\n");
    const text = buf.getText();
    expect(text).toContain("line1");
    expect(text).toContain("line2");
    buf.dispose();
  });

  it("serialize returns a string", async () => {
    const buf = new ScreenBuffer(40, 5);
    await buf.writeSync("test content");
    const serialized = buf.serialize();
    expect(typeof serialized).toBe("string");
    expect(serialized.length).toBeGreaterThan(0);
    buf.dispose();
  });

  it("caches serialized output until new write", async () => {
    const buf = new ScreenBuffer(40, 5);
    await buf.writeSync("initial");
    const first = buf.serialize();
    const second = buf.serialize();
    expect(first).toBe(second); // same reference (cached)
    await buf.writeSync(" more");
    const third = buf.serialize();
    expect(third).not.toBe(first); // new reference after write
    buf.dispose();
  });

  it("handles resize", async () => {
    const buf = new ScreenBuffer(80, 24);
    await buf.writeSync("hello");
    buf.resize(40, 12);
    expect(buf.cols).toBe(40);
    expect(buf.rows).toBe(12);
    // Content should still be accessible after resize
    expect(buf.getText()).toContain("hello");
    buf.dispose();
  });

  it("handles ANSI color codes", async () => {
    const buf = new ScreenBuffer(40, 5);
    await buf.writeSync("\x1b[32mgreen\x1b[0m");
    const text = buf.getText();
    expect(text).toContain("green");
    // serialize should include ANSI codes
    const serialized = buf.serialize();
    expect(serialized).toContain("green");
    buf.dispose();
  });

  it("handles cursor movement", async () => {
    const buf = new ScreenBuffer(40, 5);
    // Move cursor to row 2, col 5, then write
    await buf.writeSync("\x1b[2;5Hworld");
    const text = buf.getText();
    expect(text).toContain("world");
    buf.dispose();
  });
});
