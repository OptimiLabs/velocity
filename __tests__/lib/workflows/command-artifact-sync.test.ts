import { beforeEach, describe, expect, it, vi } from "vitest";

const saveSkillMock = vi.fn();
const saveProjectSkillMock = vi.fn();
const deleteSkillMock = vi.fn();
const deleteProjectSkillMock = vi.fn();

const saveCodexInstructionMock = vi.fn();
const deleteCodexInstructionMock = vi.fn();

const saveGeminiSkillMock = vi.fn();
const deleteGeminiSkillMock = vi.fn();

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
  addRouterEntry: vi.fn((content: string) => content),
  removeRouterEntry: vi.fn((content: string) => content),
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
    );
    expect(saveGeminiSkillMock).not.toHaveBeenCalled();
    expect(saveSkillMock).not.toHaveBeenCalled();
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
    );
    expect(saveCodexInstructionMock).not.toHaveBeenCalled();
    expect(saveSkillMock).not.toHaveBeenCalled();
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
