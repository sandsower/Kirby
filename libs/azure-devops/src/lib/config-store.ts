import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { Config } from "@workflow-manager/shared-types";
import { DEFAULT_CONFIG } from "@workflow-manager/shared-types";

const DEFAULT_CONFIG_PATH = join(
  homedir(),
  ".workflow-manager",
  "config.json"
);

/** Read config from disk, merging with defaults */
export function readConfig(path = DEFAULT_CONFIG_PATH): Config {
  try {
    const data = readFileSync(path, "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Write config to disk */
export function writeConfig(
  config: Config,
  path = DEFAULT_CONFIG_PATH
): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
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
