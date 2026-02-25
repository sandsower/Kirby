import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Session, SessionStore } from "@workflow-manager/shared-types";
import { listSessions as listTmuxSessions } from "./tmux.js";

const DEFAULT_STORE_PATH = join(
  homedir(),
  ".workflow-manager",
  "sessions.json"
);

/** Read sessions from disk */
export function readStore(path = DEFAULT_STORE_PATH): SessionStore {
  try {
    const data = readFileSync(path, "utf8");
    return JSON.parse(data) as SessionStore;
  } catch {
    return { sessions: [] };
  }
}

/** Write sessions to disk */
export function writeStore(
  store: SessionStore,
  path = DEFAULT_STORE_PATH
): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(store, null, 2), "utf8");
}

/** Add a session to the store */
export function addSession(session: Session, path = DEFAULT_STORE_PATH): void {
  const store = readStore(path);
  const existing = store.sessions.findIndex((s) => s.name === session.name);
  if (existing >= 0) {
    store.sessions[existing] = session;
  } else {
    store.sessions.push(session);
  }
  writeStore(store, path);
}

/** Remove a session from the store */
export function removeSession(name: string, path = DEFAULT_STORE_PATH): void {
  const store = readStore(path);
  store.sessions = store.sessions.filter((s) => s.name !== name);
  writeStore(store, path);
}

/** Update a session in the store */
export function updateSession(
  name: string,
  updates: Partial<Session>,
  path = DEFAULT_STORE_PATH
): void {
  const store = readStore(path);
  const session = store.sessions.find((s) => s.name === name);
  if (session) {
    Object.assign(session, updates);
    writeStore(store, path);
  }
}

/** Get a single session by name */
export function getSession(
  name: string,
  path = DEFAULT_STORE_PATH
): Session | undefined {
  const store = readStore(path);
  return store.sessions.find((s) => s.name === name);
}

/**
 * Reconcile stored sessions with live tmux sessions.
 * - Stored session with no live tmux session → status = "stopped"
 * - Live tmux session not in store → ignored (not our session)
 */
export function reconcile(path = DEFAULT_STORE_PATH): SessionStore {
  const store = readStore(path);
  const liveSessions = listTmuxSessions();
  const liveNames = new Set(liveSessions.map((s) => s.name));

  for (const session of store.sessions) {
    if (!liveNames.has(session.name) && session.status !== "stopped") {
      session.status = "stopped";
    }
  }

  writeStore(store, path);
  return store;
}
