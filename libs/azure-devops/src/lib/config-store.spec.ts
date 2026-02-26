import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readConfig, writeConfig, isAdoConfigured, parseAdoRemoteUrl } from "./config-store.js";
import type { Config } from "@workflow-manager/shared-types";

// Mock fs and os
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);

describe("readConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns defaults when file does not exist", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const config = readConfig();
    expect(config.pollInterval).toBe(500);
    expect(config.pat).toBeUndefined();
  });

  it("merges file data with defaults", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ pat: "my-pat", org: "myorg" })
    );
    const config = readConfig();
    expect(config.pat).toBe("my-pat");
    expect(config.org).toBe("myorg");
    expect(config.pollInterval).toBe(500); // from defaults
  });

  it("reads from custom path", () => {
    mockReadFileSync.mockReturnValue("{}");
    readConfig("/custom/path.json");
    expect(mockReadFileSync).toHaveBeenCalledWith("/custom/path.json", "utf8");
  });
});

describe("writeConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates directory if it doesn't exist", () => {
    mockExistsSync.mockReturnValue(false);
    const config: Config = { pollInterval: 500, pat: "test" };
    writeConfig(config);
    expect(vi.mocked(mkdirSync)).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("skips mkdir if directory exists", () => {
    mockExistsSync.mockReturnValue(true);
    const config: Config = { pollInterval: 500 };
    writeConfig(config);
    expect(vi.mocked(mkdirSync)).not.toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("writes JSON with formatting", () => {
    mockExistsSync.mockReturnValue(true);
    const config: Config = { pollInterval: 1000, org: "myorg" };
    writeConfig(config);
    const written = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(JSON.parse(written)).toEqual(config);
    expect(written).toContain("\n"); // pretty-printed
  });
});

describe("isAdoConfigured", () => {
  it("returns true when all fields are set", () => {
    expect(
      isAdoConfigured({
        pollInterval: 500,
        pat: "token",
        org: "myorg",
        project: "myproj",
        repo: "myrepo",
      })
    ).toBe(true);
  });

  it("returns false when pat is missing", () => {
    expect(
      isAdoConfigured({
        pollInterval: 500,
        org: "myorg",
        project: "myproj",
        repo: "myrepo",
      })
    ).toBe(false);
  });

  it("returns false when org is missing", () => {
    expect(
      isAdoConfigured({
        pollInterval: 500,
        pat: "token",
        project: "myproj",
        repo: "myrepo",
      })
    ).toBe(false);
  });

  it("returns false with empty config", () => {
    expect(isAdoConfigured({ pollInterval: 500 })).toBe(false);
  });
});

describe("parseAdoRemoteUrl", () => {
  it("parses HTTPS URL", () => {
    const result = parseAdoRemoteUrl(
      "https://dev.azure.com/myorg/myproject/_git/myrepo"
    );
    expect(result).toEqual({
      org: "myorg",
      project: "myproject",
      repo: "myrepo",
    });
  });

  it("parses HTTPS URL with username prefix", () => {
    const result = parseAdoRemoteUrl(
      "https://myorg@dev.azure.com/myorg/myproject/_git/myrepo"
    );
    expect(result).toEqual({
      org: "myorg",
      project: "myproject",
      repo: "myrepo",
    });
  });

  it("parses SSH URL", () => {
    const result = parseAdoRemoteUrl(
      "git@ssh.dev.azure.com:v3/myorg/myproject/myrepo"
    );
    expect(result).toEqual({
      org: "myorg",
      project: "myproject",
      repo: "myrepo",
    });
  });

  it("strips .git suffix", () => {
    const result = parseAdoRemoteUrl(
      "https://dev.azure.com/myorg/myproject/_git/myrepo.git"
    );
    expect(result!.repo).toBe("myrepo");
  });

  it("returns null for non-ADO URLs", () => {
    expect(parseAdoRemoteUrl("https://github.com/user/repo.git")).toBeNull();
    expect(parseAdoRemoteUrl("git@github.com:user/repo.git")).toBeNull();
    expect(parseAdoRemoteUrl("not a url")).toBeNull();
  });
});
