import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Config, GlobalConfig, ProjectConfig } from "@workflow-manager/shared-types";
import { DEFAULT_CONFIG, DEFAULT_GLOBAL_CONFIG, DEFAULT_PROJECT_CONFIG } from "@workflow-manager/shared-types";

const WM_DIR = join(homedir(), ".workflow-manager");
const GLOBAL_CONFIG_PATH = join(WM_DIR, "config.json");

/** Hash CWD to a 16-char hex key for per-project config */
export function projectKey(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

/** Path to per-project config file */
function projectConfigPath(cwd: string): string {
  return join(WM_DIR, "projects", projectKey(cwd), "config.json");
}

/** Read JSON file, returning fallback on any error */
function readJsonFile<T>(path: string, fallback: T): T {
  try {
    const data = readFileSync(path, "utf8");
    return { ...fallback, ...JSON.parse(data) };
  } catch {
    return { ...fallback };
  }
}

/** Write JSON file, creating parent dirs as needed */
function writeJsonFile<T>(path: string, data: T): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

/** Read global config (~/.workflow-manager/config.json) */
export function readGlobalConfig(): GlobalConfig {
  return readJsonFile(GLOBAL_CONFIG_PATH, DEFAULT_GLOBAL_CONFIG);
}

/** Write global config (~/.workflow-manager/config.json) */
export function writeGlobalConfig(config: GlobalConfig): void {
  writeJsonFile(GLOBAL_CONFIG_PATH, config);
}

/** Read per-project config (~/.workflow-manager/projects/<hash>/config.json) */
export function readProjectConfig(cwd = process.cwd()): ProjectConfig {
  return readJsonFile(projectConfigPath(cwd), DEFAULT_PROJECT_CONFIG);
}

/** Write per-project config (~/.workflow-manager/projects/<hash>/config.json) */
export function writeProjectConfig(config: ProjectConfig, cwd = process.cwd()): void {
  writeJsonFile(projectConfigPath(cwd), config);
}

/** Read merged config: defaults → global → project */
export function readConfig(cwd = process.cwd()): Config {
  const global = readGlobalConfig();
  const project = readProjectConfig(cwd);
  return { ...DEFAULT_CONFIG, ...global, ...project };
}

/** Check if Azure DevOps is fully configured */
export function isAdoConfigured(config: Config): boolean {
  return !!(config.pat && config.org && config.project && config.repo);
}

/**
 * Parse org, project, and repo from an Azure DevOps git remote URL.
 * Supports both SSH and HTTPS formats:
 * - https://dev.azure.com/{org}/{project}/_git/{repo}
 * - https://{org}@dev.azure.com/{org}/{project}/_git/{repo}
 * - git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
 */
export function parseAdoRemoteUrl(
  url: string
): { org: string; project: string; repo: string } | null {
  // HTTPS: https://dev.azure.com/{org}/{project}/_git/{repo}
  // or https://{org}@dev.azure.com/{org}/{project}/_git/{repo}
  const httpsMatch = url.match(
    /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/\s]+)/
  );
  if (httpsMatch) {
    return {
      org: httpsMatch[1]!,
      project: httpsMatch[2]!,
      repo: httpsMatch[3]!.replace(/\.git$/, ""),
    };
  }

  // SSH: git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
  const sshMatch = url.match(
    /ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/\s]+)/
  );
  if (sshMatch) {
    return {
      org: sshMatch[1]!,
      project: sshMatch[2]!,
      repo: sshMatch[3]!.replace(/\.git$/, ""),
    };
  }

  return null;
}

/**
 * Auto-detect project config fields from the git repo.
 * Fills empty org/project/repo from `git remote get-url origin` and
 * empty email from `git config user.email`. Writes back if any field was updated.
 * Returns what was detected and whether the config was updated.
 */
export function autoDetectProjectConfig(cwd = process.cwd()): {
  updated: boolean;
  detected: Partial<ProjectConfig>;
} {
  const cfg = readProjectConfig(cwd);
  const detected: Partial<ProjectConfig> = {};

  // Auto-detect org/project/repo from git remote
  if (!cfg.org || !cfg.project || !cfg.repo) {
    try {
      const remoteUrl = execSync("git remote get-url origin", {
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
      const parsed = parseAdoRemoteUrl(remoteUrl);
      if (parsed) {
        if (!cfg.org) { cfg.org = parsed.org; detected.org = parsed.org; }
        if (!cfg.project) { cfg.project = parsed.project; detected.project = parsed.project; }
        if (!cfg.repo) { cfg.repo = parsed.repo; detected.repo = parsed.repo; }
      }
    } catch {
      // git remote may fail — not critical
    }
  }

  // Auto-detect email from git config
  if (!cfg.email) {
    try {
      const email = execSync("git config user.email", {
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
      if (email) {
        cfg.email = email;
        detected.email = email;
      }
    } catch {
      // git config may fail — not critical
    }
  }

  const updated = Object.keys(detected).length > 0;
  if (updated) {
    writeProjectConfig(cfg, cwd);
  }

  return { updated, detected };
}
