import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { CodexConfig } from "@/lib/codex/config";

describe("readCodexConfigFrom", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "codex-cfg-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads model and approval_policy from config.toml", async () => {
    const configPath = join(dir, "config.toml");
    writeFileSync(
      configPath,
      'model = "o3"\napproval_policy = "on-request"\n'
    );
    const { readCodexConfigFrom } = await import("@/lib/codex/config");
    const cfg = readCodexConfigFrom(configPath);
    expect(cfg.model).toBe("o3");
    expect(cfg.approval_policy).toBe("on-request");
  });

  it("returns empty config for missing file", async () => {
    const { readCodexConfigFrom } = await import("@/lib/codex/config");
    const cfg = readCodexConfigFrom(join(dir, "missing.toml"));
    expect(cfg).toEqual({});
  });
});

describe("CodexConfig interface completeness", () => {
  it("should support all documented config.toml keys", () => {
    const config: CodexConfig = {
      model: "gpt-5-codex",
      approval_policy: "on-request",
      model_provider: "openai",
      sandbox_mode: "workspace-write",
    };
    expect(config.model).toBe("gpt-5-codex");
    expect(config.approval_policy).toBe("on-request");
    expect(config.model_provider).toBe("openai");
    expect(config.sandbox_mode).toBe("workspace-write");
  });

  it("approval_policy should accept Codex values", () => {
    const configs: CodexConfig[] = [
      { approval_policy: "untrusted" },
      { approval_policy: "on-request" },
      { approval_policy: "never" },
    ];
    expect(configs).toHaveLength(3);
  });

  it("should support MCP server configuration", () => {
    const config: CodexConfig = {
      mcp_servers: { "my-server": { command: "node server.js" } },
    };
    expect(config.mcp_servers?.["my-server"]?.command).toBe("node server.js");
  });

  it("should support features table", () => {
    const config: CodexConfig = {
      features: { shell_tool: true, multi_agent: false },
    };
    expect(config.features?.shell_tool).toBe(true);
  });

  it("should support agent role configuration", () => {
    const config: CodexConfig = {
      agents: {
        reviewer: {
          config_file: "~/.codex/agents/reviewer.toml",
        },
      },
    };
    expect(config.agents?.reviewer?.config_file).toBe(
      "~/.codex/agents/reviewer.toml",
    );
  });

  it("should support history configuration with typed persistence", () => {
    const config: CodexConfig = {
      history: { max_entries: 100, persistence: "save-all" },
    };
    expect(config.history?.persistence).toBe("save-all");
  });

  it("should support sandbox_mode values", () => {
    const configs: CodexConfig[] = [
      { sandbox_mode: "read-only" },
      { sandbox_mode: "workspace-write" },
      { sandbox_mode: "danger-full-access" },
    ];
    expect(configs).toHaveLength(3);
  });
});
