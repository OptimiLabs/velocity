import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { Agent } from "@/types/agent";
import {
  listProviderAgents,
  saveProviderAgent,
  deleteProviderAgent,
  setProviderAgentDisabled,
} from "@/lib/providers/agent-files";
import {
  projectCodexConfig,
  projectCodexRoleAgentsDir,
  projectCodexVelocityAgentsDir,
  projectCodexVelocityDisabledAgentsDir,
} from "@/lib/codex/paths";
import { readCodexSettingsFrom } from "@/lib/codex/settings";

const tempDirs: string[] = [];

function makeTempProjectDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-agent-sync-"));
  tempDirs.push(dir);
  return dir;
}

function makeAgent(projectPath: string): Agent {
  return {
    name: "cloud-architect",
    provider: "codex",
    description: "Cloud architecture specialist",
    model: "gpt-5.3-codex",
    effort: "high",
    prompt: "Design scalable infrastructure",
    filePath: "",
    scope: "project",
    projectPath,
  };
}

afterEach(() => {
  for (const dir of tempDirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  tempDirs.length = 0;
});

describe("codex provider agent registry sync", () => {
  it("writes project role config and registers it in .codex/config.toml", () => {
    const projectPath = makeTempProjectDir();
    saveProviderAgent("codex", makeAgent(projectPath), projectPath);

    const activeDir = projectCodexVelocityAgentsDir(projectPath);
    const roleDir = projectCodexRoleAgentsDir(projectPath);
    const markdownPath = path.join(activeDir, "cloud-architect.md");
    const rolePath = path.join(roleDir, "cloud-architect.toml");
    const configPath = projectCodexConfig(projectPath);

    expect(fs.existsSync(markdownPath)).toBe(true);
    expect(fs.existsSync(rolePath)).toBe(true);

    const roleContent = fs.readFileSync(rolePath, "utf-8");
    expect(roleContent).toContain("prompt = \"Design scalable infrastructure\"");
    expect(roleContent).toContain("model = \"gpt-5.3-codex\"");

    const cfg = readCodexSettingsFrom(configPath);
    expect(cfg.agents?.["cloud-architect"]?.config_file).toBe(
      rolePath,
    );
  });

  it("backfills existing markdown agents into Codex registry during list", () => {
    const projectPath = makeTempProjectDir();
    const activeDir = projectCodexVelocityAgentsDir(projectPath);
    fs.mkdirSync(activeDir, { recursive: true });
    fs.writeFileSync(
      path.join(activeDir, "cloud-architect.md"),
      [
        "---",
        "name: cloud-architect",
        "description: Cloud architecture specialist",
        "model: gpt-5.3-codex",
        "effort: high",
        "---",
        "",
        "Design scalable infrastructure",
        "",
      ].join("\n"),
      "utf-8",
    );

    const agents = listProviderAgents("codex", projectPath);
    const rolePath = path.join(
      projectCodexRoleAgentsDir(projectPath),
      "cloud-architect.toml",
    );
    const cfg = readCodexSettingsFrom(projectCodexConfig(projectPath));

    expect(agents.some((agent) => agent.name === "cloud-architect")).toBe(true);
    expect(fs.existsSync(rolePath)).toBe(true);
    expect(cfg.agents?.["cloud-architect"]?.config_file).toBe(
      rolePath,
    );
  });

  it("removes and restores Codex role registration when toggling disabled", () => {
    const projectPath = makeTempProjectDir();
    saveProviderAgent("codex", makeAgent(projectPath), projectPath);

    const activeDir = projectCodexVelocityAgentsDir(projectPath);
    const disabledDir = projectCodexVelocityDisabledAgentsDir(projectPath);
    const roleDir = projectCodexRoleAgentsDir(projectPath);
    const activeMarkdownPath = path.join(activeDir, "cloud-architect.md");
    const disabledMarkdownPath = path.join(disabledDir, "cloud-architect.md");
    const rolePath = path.join(roleDir, "cloud-architect.toml");
    const configPath = projectCodexConfig(projectPath);

    expect(
      setProviderAgentDisabled("codex", "cloud-architect", true, projectPath),
    ).toBe(true);
    expect(fs.existsSync(activeMarkdownPath)).toBe(false);
    expect(fs.existsSync(disabledMarkdownPath)).toBe(true);
    expect(fs.existsSync(rolePath)).toBe(false);
    expect(readCodexSettingsFrom(configPath).agents?.["cloud-architect"]).toBeUndefined();

    expect(
      setProviderAgentDisabled("codex", "cloud-architect", false, projectPath),
    ).toBe(true);
    expect(fs.existsSync(activeMarkdownPath)).toBe(true);
    expect(fs.existsSync(disabledMarkdownPath)).toBe(false);
    expect(fs.existsSync(rolePath)).toBe(true);
    expect(readCodexSettingsFrom(configPath).agents?.["cloud-architect"]).toBeDefined();
  });

  it("removes managed role entry from config when deleting", () => {
    const projectPath = makeTempProjectDir();
    saveProviderAgent("codex", makeAgent(projectPath), projectPath);

    const activeDir = projectCodexVelocityAgentsDir(projectPath);
    const roleDir = projectCodexRoleAgentsDir(projectPath);
    const configPath = projectCodexConfig(projectPath);

    expect(deleteProviderAgent("codex", "cloud-architect", projectPath)).toBe(true);
    expect(fs.existsSync(path.join(activeDir, "cloud-architect.md"))).toBe(false);
    expect(fs.existsSync(path.join(roleDir, "cloud-architect.toml"))).toBe(false);
    expect(readCodexSettingsFrom(configPath).agents?.["cloud-architect"]).toBeUndefined();
  });
});
