import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.kirby', 'logs');
const LOG_PATH = join(LOG_DIR, 'kirby.log');

let ensured = false;

export function log(level: 'info' | 'warn' | 'error', message: string) {
  if (!ensured) {
    mkdirSync(LOG_DIR, { recursive: true });
    ensured = true;
  }
  const ts = new Date().toISOString();
  appendFileSync(LOG_PATH, `${ts} [${level}] ${message}\n`);
}

export function logError(context: string, err: unknown) {
  const msg =
    err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
  log('error', `${context}: ${msg}`);
}
