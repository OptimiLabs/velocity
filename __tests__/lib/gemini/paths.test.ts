import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";

describe("gemini/paths", () => {
  it("GEMINI_HOME points to ~/.gemini", async () => {
    const { GEMINI_HOME } = await import("@/lib/gemini/paths");
    expect(GEMINI_HOME).toBe(path.join(os.homedir(), ".gemini"));
  });

  it("GEMINI_CONFIG points to ~/.gemini/settings.json", async () => {
    const { GEMINI_CONFIG } = await import("@/lib/gemini/paths");
    expect(GEMINI_CONFIG).toBe(
      path.join(os.homedir(), ".gemini", "settings.json"),
    );
  });

  it("GEMINI_TMP_DIR points to ~/.gemini/tmp", async () => {
    const { GEMINI_TMP_DIR } = await import("@/lib/gemini/paths");
    expect(GEMINI_TMP_DIR).toBe(path.join(os.homedir(), ".gemini", "tmp"));
  });

  it("projectGeminiDir returns <project>/.gemini", async () => {
    const { projectGeminiDir } = await import("@/lib/gemini/paths");
    expect(projectGeminiDir("/my/project")).toBe("/my/project/.gemini");
  });

  it("projectGeminiConfig returns <project>/.gemini/settings.json", async () => {
    const { projectGeminiConfig } = await import("@/lib/gemini/paths");
    expect(projectGeminiConfig("/my/project")).toBe(
      "/my/project/.gemini/settings.json",
    );
  });
});
