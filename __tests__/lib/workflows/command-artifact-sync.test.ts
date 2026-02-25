import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { parse } from "smol-toml";

const saveSkillMock = vi.fn();
const saveProjectSkillMock = vi.fn();
const deleteSkillMock = vi.fn();
const deleteProjectSkillMock = vi.fn();

const saveCodexInstructionMock = vi.fn();
const deleteCodexInstructionMock = vi.fn();

const saveGeminiSkillMock = vi.fn();
const deleteGeminiSkillMock = vi.fn();
const addRouterEntryMock = vi.fn((content: string) => content);
const generateRouterContentMock = vi.fn(() => "# AGENTS\n");
const removeRouterEntryMock = vi.fn((content: string) => content);

vi.mock("@/lib/skills", () => ({
  saveSkill: saveSkillMock,
  saveProjectSkill: saveProjectSkillMock,
  deleteSkill: deleteSkillMock,
  deleteProjectSkill: deleteProjectSkillMock,
}));

vi.mock("@/lib/codex/skills", () => ({
  saveCodexInstruction: saveCodexInstructionMock,
  deleteCodexInstruction: deleteCodexInstructionMock,
}));

vi.mock("@/lib/gemini/skills", () => ({
  saveGeminiSkill: saveGeminiSkillMock,
  deleteGeminiSkill: deleteGeminiSkillMock,
}));

vi.mock("@/lib/instructions/router-writer", () => ({
  addRouterEntry: addRouterEntryMock,
  generateRouterContent: generateRouterContentMock,
  removeRouterEntry: removeRouterEntryMock,
}));

describe("workflow command artifact sync", () => {
  beforeEach(() => {
    saveSkillMock.mockReset();
    saveProjectSkillMock.mockReset();
    deleteSkillMock.mockReset();
    deleteProjectSkillMock.mockReset();
    deleteProjectSkillMock.mockReturnValue(true);

    saveCodexInstructionMock.mockReset();
    deleteCodexInstructionMock.mockReset();
    saveGeminiSkillMock.mockReset();
    deleteGeminiSkillMock.mockReset();
    deleteGeminiSkillMock.mockReturnValue(true);
    addRouterEntryMock.mockReset();
    generateRouterContentMock.mockReset();
    removeRouterEntryMock.mockReset();
    addRouterEntryMock.mockImplementation((content: string) => content);
    generateRouterContentMock.mockImplementation(() => "# AGENTS\n");
    removeRouterEntryMock.mockImplementation((content: string) => content);
  });

  it("saves codex workflow commands into codex instruction storage", async () => {
    const { syncWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );

    syncWorkflowCommandArtifact({
      provider: "codex",
      commandName: "review-pr",
      commandDescription: "Review pull requests",
      prompt: "Prompt body",
      projectPath: "/tmp/demo",
    });

    expect(saveCodexInstructionMock).toHaveBeenCalledWith(
      "review-pr",
      "Prompt body",
      "/tmp/demo",
      "Review pull requests",
    );
    expect(saveGeminiSkillMock).not.toHaveBeenCalled();
    expect(saveSkillMock).not.toHaveBeenCalled();
  });

  it("routes codex workflow commands into AGENTS.md when present", async () => {
    const { syncWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "wf-codex-"));
    try {
      fs.writeFileSync(
        path.join(projectPath, "AGENTS.md"),
        "# AGENTS\n\n## Skills\n\n| When... | Use |\n| --- | --- |\n",
      );

      syncWorkflowCommandArtifact({
        provider: "codex",
        commandName: "review-pr",
        commandDescription: "Review pull requests",
        prompt: "Prompt body",
        projectPath,
      });

      expect(addRouterEntryMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          trigger: "Review pull requests",
          path: "review-pr",
          category: "skills",
          type: "skill",
        }),
      );
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("saves gemini workflow commands into gemini skill storage", async () => {
    const { syncWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );

    syncWorkflowCommandArtifact({
      provider: "gemini",
      commandName: "triage-issues",
      prompt: "Prompt body",
    });

    expect(saveGeminiSkillMock).toHaveBeenCalledWith(
      "triage-issues",
      "Prompt body",
      undefined,
      "triage issues",
    );
    expect(saveCodexInstructionMock).not.toHaveBeenCalled();
    expect(saveSkillMock).not.toHaveBeenCalled();
  });

  it("routes gemini workflow commands into GEMINI.md when present", async () => {
    const { syncWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gemini-"));
    try {
      fs.writeFileSync(
        path.join(projectPath, "GEMINI.md"),
        "# GEMINI\n\n## Skills\n\n| When... | Use |\n| --- | --- |\n",
      );

      syncWorkflowCommandArtifact({
        provider: "gemini",
        commandName: "triage-issues",
        commandDescription: "Triage issues",
        prompt: "Prompt body",
        projectPath,
      });

      expect(addRouterEntryMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          trigger: "Triage issues",
          path: "triage-issues",
          category: "skills",
          type: "skill",
        }),
      );
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("routes gemini workflow commands into configured context file when present", async () => {
    const { syncWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gemini-ctx-"));
    try {
      fs.mkdirSync(path.join(projectPath, ".gemini"), { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, ".gemini", "settings.json"),
        JSON.stringify({ contextFileName: "PROJECT_CONTEXT.md" }),
      );
      fs.writeFileSync(
        path.join(projectPath, "PROJECT_CONTEXT.md"),
        "# PROJECT CONTEXT\n\n## Skills\n\n| When... | Use |\n| --- | --- |\n",
      );

      syncWorkflowCommandArtifact({
        provider: "gemini",
        commandName: "triage-issues",
        commandDescription: "Triage issues",
        prompt: "Prompt body",
        projectPath,
      });

      expect(addRouterEntryMock).toHaveBeenCalledWith(
        expect.stringContaining("# PROJECT CONTEXT"),
        expect.objectContaining({
          trigger: "Triage issues",
          path: "triage-issues",
          category: "skills",
          type: "skill",
        }),
      );
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("writes a native Gemini slash-command file for project-scoped workflow commands", async () => {
    const { syncWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gemini-cmd-"));
    try {
      syncWorkflowCommandArtifact({
        provider: "gemini",
        commandName: "triage-issues",
        commandDescription: "Triage issues",
        prompt: "Prompt body",
        projectPath,
      });

      const cmdPath = path.join(
        projectPath,
        ".gemini",
        "commands",
        "triage-issues.toml",
      );
      expect(fs.existsSync(cmdPath)).toBe(true);

      const parsed = parse(
        fs.readFileSync(cmdPath, "utf-8"),
      ) as { prompt?: string; description?: string };
      expect(parsed.prompt).toContain("Prompt body");
      expect(parsed.description).toBe("Triage issues");
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("saves claude workflow commands with derived description when missing", async () => {
    const { syncWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );

    syncWorkflowCommandArtifact({
      provider: "claude",
      commandName: "ship-release",
      prompt: "Prompt body",
      autoRouteClaude: false,
    });

    expect(saveSkillMock).toHaveBeenCalledWith(
      "ship-release",
      "ship release",
      "Prompt body",
    );
  });

  it("writes a native Claude slash-command file for project-scoped workflow commands", async () => {
    const { syncWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "wf-claude-cmd-"));
    try {
      syncWorkflowCommandArtifact({
        provider: "claude",
        commandName: "ship-release",
        commandDescription: "Ship release",
        prompt: "Prompt body",
        projectPath,
        autoRouteClaude: false,
      });

      const cmdPath = path.join(
        projectPath,
        ".claude",
        "commands",
        "ship-release.md",
      );
      expect(fs.existsSync(cmdPath)).toBe(true);
      expect(fs.readFileSync(cmdPath, "utf-8")).toContain("Prompt body");
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("cleans provider-scoped command artifacts for codex and gemini", async () => {
    const { cleanupWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );

    cleanupWorkflowCommandArtifact({
      provider: "codex",
      commandName: "review-pr",
      projectPath: "/tmp/demo",
    });
    cleanupWorkflowCommandArtifact({
      provider: "gemini",
      commandName: "triage-issues",
    });

    expect(deleteCodexInstructionMock).toHaveBeenCalledWith(
      "review-pr",
      "/tmp/demo",
    );
    expect(deleteGeminiSkillMock).toHaveBeenCalledWith(
      "triage-issues",
      undefined,
    );
  });

  it("removes native Claude slash-command file during cleanup", async () => {
    const { cleanupWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );
    const projectPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "wf-claude-clean-"),
    );
    const cmdPath = path.join(
      projectPath,
      ".claude",
      "commands",
      "ship-release.md",
    );
    try {
      fs.mkdirSync(path.dirname(cmdPath), { recursive: true });
      fs.writeFileSync(cmdPath, "Prompt body\n", "utf-8");

      cleanupWorkflowCommandArtifact({
        provider: "claude",
        commandName: "ship-release",
        projectPath,
      });

      expect(fs.existsSync(cmdPath)).toBe(false);
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("cleans gemini command route entries from GEMINI.md when present", async () => {
    const { cleanupWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gemini-clean-"));
    try {
      fs.writeFileSync(
        path.join(projectPath, "GEMINI.md"),
        "# GEMINI\n\n## Skills\n\n| When... | Use |\n| --- | --- |\n| Triage issues | /triage-issues |\n",
      );

      cleanupWorkflowCommandArtifact({
        provider: "gemini",
        commandName: "triage-issues",
        projectPath,
      });

      expect(deleteGeminiSkillMock).toHaveBeenCalledWith(
        "triage-issues",
        projectPath,
      );
      expect(removeRouterEntryMock).toHaveBeenCalledWith(
        expect.any(String),
        "triage-issues",
      );
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("cleans gemini command route entries from configured context file when present", async () => {
    const { cleanupWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "wf-gemini-clean-ctx-"));
    try {
      fs.mkdirSync(path.join(projectPath, ".gemini"), { recursive: true });
      fs.writeFileSync(
        path.join(projectPath, ".gemini", "settings.json"),
        JSON.stringify({ context: { fileName: "TEAM_CONTEXT.md" } }),
      );
      fs.writeFileSync(
        path.join(projectPath, "TEAM_CONTEXT.md"),
        "# TEAM CONTEXT\n\n## Skills\n\n| When... | Use |\n| --- | --- |\n| Triage issues | /triage-issues |\n",
      );

      cleanupWorkflowCommandArtifact({
        provider: "gemini",
        commandName: "triage-issues",
        projectPath,
      });

      expect(deleteGeminiSkillMock).toHaveBeenCalledWith(
        "triage-issues",
        projectPath,
      );
      expect(removeRouterEntryMock).toHaveBeenCalledWith(
        expect.stringContaining("# TEAM CONTEXT"),
        "triage-issues",
      );
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("removes native Gemini slash-command file during cleanup", async () => {
    const { cleanupWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );
    const projectPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "wf-gemini-clean-cmd-"),
    );
    const cmdPath = path.join(
      projectPath,
      ".gemini",
      "commands",
      "triage-issues.toml",
    );
    try {
      fs.mkdirSync(path.dirname(cmdPath), { recursive: true });
      fs.writeFileSync(cmdPath, 'prompt = "Prompt body\\n"\n', "utf-8");

      cleanupWorkflowCommandArtifact({
        provider: "gemini",
        commandName: "triage-issues",
        projectPath,
      });

      expect(fs.existsSync(cmdPath)).toBe(false);
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("falls back to global delete when a claude project skill is absent", async () => {
    deleteProjectSkillMock.mockReturnValue(false);
    const { cleanupWorkflowCommandArtifact } = await import(
      "@/lib/workflows/command-artifact-sync"
    );

    cleanupWorkflowCommandArtifact({
      provider: "claude",
      commandName: "legacy-command",
      projectPath: "/tmp/demo",
      removeClaudeRoute: false,
    });

    expect(deleteProjectSkillMock).toHaveBeenCalledWith(
      "/tmp/demo",
      "legacy-command",
    );
    expect(deleteSkillMock).toHaveBeenCalledWith("legacy-command");
  });
});
