import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Session } from "@workflow-manager/shared-types";
import {
  readStore,
  writeStore,
  addSession,
  removeSession,
  updateSession,
  getSession,
  reconcile,
} from "./session-store.js";

// Mock the tmux module for reconcile tests
vi.mock("./tmux.js", () => ({
  listSessions: vi.fn(() => []),
}));

import { listSessions as mockListSessions } from "./tmux.js";

let tempDir: string;
let storePath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "wm-test-"));
  storePath = join(tempDir, "sessions.json");
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function makeSession(name: string, overrides: Partial<Session> = {}): Session {
  return {
    name,
    status: "idle",
    createdAt: "2024-01-01T00:00:00Z",
    lastCheckedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("readStore", () => {
  it("should return empty store when file doesn't exist", () => {
    const store = readStore(storePath);
    expect(store).toEqual({ sessions: [] });
  });

  it("should read existing store", () => {
    const session = makeSession("test");
    writeStore({ sessions: [session] }, storePath);
    const store = readStore(storePath);
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.name).toBe("test");
  });
});

describe("writeStore", () => {
  it("should create directory if it doesn't exist", () => {
    const deepPath = join(tempDir, "deep", "nested", "sessions.json");
    writeStore({ sessions: [] }, deepPath);
    const store = readStore(deepPath);
    expect(store).toEqual({ sessions: [] });
  });
});

describe("addSession", () => {
  it("should add a new session", () => {
    addSession(makeSession("alpha"), storePath);
    const store = readStore(storePath);
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.name).toBe("alpha");
  });

  it("should update existing session with same name", () => {
    addSession(makeSession("alpha", { status: "idle" }), storePath);
    addSession(makeSession("alpha", { status: "running" }), storePath);
    const store = readStore(storePath);
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.status).toBe("running");
  });

  it("should add multiple sessions", () => {
    addSession(makeSession("alpha"), storePath);
    addSession(makeSession("beta"), storePath);
    const store = readStore(storePath);
    expect(store.sessions).toHaveLength(2);
  });
});

describe("removeSession", () => {
  it("should remove a session by name", () => {
    addSession(makeSession("alpha"), storePath);
    addSession(makeSession("beta"), storePath);
    removeSession("alpha", storePath);
    const store = readStore(storePath);
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.name).toBe("beta");
  });

  it("should be a no-op for non-existent session", () => {
    addSession(makeSession("alpha"), storePath);
    removeSession("nonexistent", storePath);
    const store = readStore(storePath);
    expect(store.sessions).toHaveLength(1);
  });
});

describe("updateSession", () => {
  it("should update session fields", () => {
    addSession(makeSession("alpha", { status: "idle" }), storePath);
    updateSession("alpha", { status: "running" }, storePath);
    const session = getSession("alpha", storePath);
    expect(session!.status).toBe("running");
  });

  it("should be a no-op for non-existent session", () => {
    updateSession("nonexistent", { status: "running" }, storePath);
    const store = readStore(storePath);
    expect(store.sessions).toHaveLength(0);
  });
});

describe("getSession", () => {
  it("should return session by name", () => {
    addSession(makeSession("alpha"), storePath);
    const session = getSession("alpha", storePath);
    expect(session).toBeDefined();
    expect(session!.name).toBe("alpha");
  });

  it("should return undefined for non-existent session", () => {
    const session = getSession("nonexistent", storePath);
    expect(session).toBeUndefined();
  });
});

describe("reconcile", () => {
  it("should mark stored sessions as stopped when tmux session is gone", () => {
    addSession(makeSession("alpha", { status: "running" }), storePath);
    addSession(makeSession("beta", { status: "idle" }), storePath);
    vi.mocked(mockListSessions).mockReturnValueOnce([]);

    const store = reconcile(storePath);
    expect(store.sessions[0]!.status).toBe("stopped");
    expect(store.sessions[1]!.status).toBe("stopped");
  });

  it("should keep status if tmux session still exists", () => {
    addSession(makeSession("alpha", { status: "running" }), storePath);
    vi.mocked(mockListSessions).mockReturnValueOnce([
      { name: "alpha", windows: 1, created: 0, attached: false },
    ]);

    const store = reconcile(storePath);
    expect(store.sessions[0]!.status).toBe("running");
  });

  it("should not re-mark already stopped sessions", () => {
    addSession(makeSession("alpha", { status: "stopped" }), storePath);
    vi.mocked(mockListSessions).mockReturnValueOnce([]);

    const store = reconcile(storePath);
    expect(store.sessions[0]!.status).toBe("stopped");
  });

  it("should ignore live tmux sessions not in store", () => {
    vi.mocked(mockListSessions).mockReturnValueOnce([
      { name: "unknown", windows: 1, created: 0, attached: false },
    ]);

    const store = reconcile(storePath);
    expect(store.sessions).toHaveLength(0);
  });
});
