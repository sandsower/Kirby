import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  readConfig,
  readGlobalConfig,
  writeGlobalConfig,
  readProjectConfig,
  writeProjectConfig,
  projectKey,
  isAdoConfigured,
  parseAdoRemoteUrl,
} from "./config-store.js";

// Mock fs, os, crypto
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

vi.mock("node:crypto", () => ({
  createHash: () => ({
    update: () => ({
      digest: () => "abcdef1234567890ffffffffffffffff",
    }),
  }),
}));

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);

describe("projectKey", () => {
  it("returns first 16 chars of SHA-256 hex", () => {
    expect(projectKey("/some/path")).toBe("abcdef1234567890");
  });
});

describe("readGlobalConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns defaults when file does not exist", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const config = readGlobalConfig();
    expect(config.pollInterval).toBe(500);
    expect(config.pat).toBeUndefined();
  });

  it("merges file data with defaults", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ pat: "my-pat", pollInterval: 1000 })
    );
    const config = readGlobalConfig();
    expect(config.pat).toBe("my-pat");
    expect(config.pollInterval).toBe(1000);
  });

  it("reads from the global config path", () => {
    mockReadFileSync.mockReturnValue("{}");
    readGlobalConfig();
    expect(mockReadFileSync).toHaveBeenCalledWith(
      "/home/testuser/.workflow-manager/config.json",
      "utf8"
    );
  });
});

describe("writeGlobalConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates directory if it doesn't exist", () => {
    mockExistsSync.mockReturnValue(false);
    writeGlobalConfig({ pollInterval: 500, pat: "test" });
    expect(vi.mocked(mkdirSync)).toHaveBeenCalled();
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it("writes to the global config path", () => {
    mockExistsSync.mockReturnValue(true);
    writeGlobalConfig({ pollInterval: 1000 });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/home/testuser/.workflow-manager/config.json",
      expect.any(String),
      "utf8"
    );
    const written = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(JSON.parse(written)).toEqual({ pollInterval: 1000 });
  });
});

describe("readProjectConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty defaults when file does not exist", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const config = readProjectConfig("/some/project");
    expect(config).toEqual({});
  });

  it("reads from the per-project config path", () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ org: "myorg", project: "myproj" })
    );
    const config = readProjectConfig("/some/project");
    expect(config.org).toBe("myorg");
    expect(config.project).toBe("myproj");
    expect(mockReadFileSync).toHaveBeenCalledWith(
      "/home/testuser/.workflow-manager/projects/abcdef1234567890/config.json",
      "utf8"
    );
  });
});

describe("writeProjectConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates directories if they don't exist", () => {
    mockExistsSync.mockReturnValue(false);
    writeProjectConfig({ org: "myorg" }, "/some/project");
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(
      "/home/testuser/.workflow-manager/projects/abcdef1234567890",
      { recursive: true }
    );
  });

  it("writes to the per-project config path", () => {
    mockExistsSync.mockReturnValue(true);
    writeProjectConfig({ org: "myorg", repo: "myrepo" }, "/some/project");
    const written = mockWriteFileSync.mock.calls[0]![1] as string;
    expect(JSON.parse(written)).toEqual({ org: "myorg", repo: "myrepo" });
  });
});

describe("readConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges defaults, global, and project configs", () => {
    // First call: global config
    // Second call: project config
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ pat: "my-pat", pollInterval: 1000 }))
      .mockReturnValueOnce(JSON.stringify({ org: "myorg", project: "myproj", repo: "myrepo" }));

    const config = readConfig("/some/project");
    expect(config.pat).toBe("my-pat");
    expect(config.pollInterval).toBe(1000);
    expect(config.org).toBe("myorg");
    expect(config.project).toBe("myproj");
    expect(config.repo).toBe("myrepo");
  });

  it("project values override global values", () => {
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ pat: "my-pat" }))
      .mockReturnValueOnce(JSON.stringify({ org: "project-org" }));

    const config = readConfig("/some/project");
    expect(config.org).toBe("project-org");
    expect(config.pat).toBe("my-pat");
  });

  it("returns defaults when both files are missing", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const config = readConfig("/some/project");
    expect(config.pollInterval).toBe(500);
    expect(config.pat).toBeUndefined();
    expect(config.org).toBeUndefined();
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
