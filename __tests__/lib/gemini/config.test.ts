import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("gemini/config", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gemini-cfg-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("readGeminiConfigFrom reads JSON settings", async () => {
    const configPath = join(dir, "settings.json");
    writeFileSync(
      configPath,
      JSON.stringify({ selectedModel: "gemini-2.5-pro", theme: "dark" }),
    );
    const { readGeminiConfigFrom } = await import("@/lib/gemini/config");
    const cfg = readGeminiConfigFrom(configPath);
    expect(cfg.selectedModel).toBe("gemini-2.5-pro");
    expect(cfg.theme).toBe("dark");
  });

  it("returns {} for missing file", async () => {
    const { readGeminiConfigFrom } = await import("@/lib/gemini/config");
    const cfg = readGeminiConfigFrom(join(dir, "missing.json"));
    expect(cfg).toEqual({});
  });

  it("returns {} for malformed JSON", async () => {
    const configPath = join(dir, "settings.json");
    writeFileSync(configPath, "not valid json {{{");
    const { readGeminiConfigFrom } = await import("@/lib/gemini/config");
    const cfg = readGeminiConfigFrom(configPath);
    expect(cfg).toEqual({});
  });

  it("round-trips through writeGeminiConfigTo/readGeminiConfigFrom", async () => {
    const configPath = join(dir, "sub", "settings.json");
    const { readGeminiConfigFrom, writeGeminiConfigTo } =
      await import("@/lib/gemini/config");
    const data = {
      selectedAuthType: "oauth",
      selectedModel: "gemini-2.5-flash",
      theme: "light",
    };
    writeGeminiConfigTo(configPath, data);
    const result = readGeminiConfigFrom(configPath);
    expect(result).toEqual(data);
  });

  it("GeminiConfig interface supports selectedAuthType, theme, selectedModel", async () => {
    const configPath = join(dir, "settings.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        selectedAuthType: "api_key",
        theme: "dark",
        selectedModel: "gemini-2.5-pro",
      }),
    );
    const { readGeminiConfigFrom } = await import("@/lib/gemini/config");
    const cfg = readGeminiConfigFrom(configPath);
    expect(cfg.selectedAuthType).toBe("api_key");
    expect(cfg.theme).toBe("dark");
    expect(cfg.selectedModel).toBe("gemini-2.5-pro");
  });

  it("normalizes legacy model string to model.name on read", async () => {
    const configPath = join(dir, "settings.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        model: "gemini-2.5-pro",
      }),
    );
    const { readGeminiConfigFrom } = await import("@/lib/gemini/config");
    const cfg = readGeminiConfigFrom(configPath);
    expect(cfg.model).toEqual({ name: "gemini-2.5-pro" });
  });

  it("writes model string as object for Gemini CLI compatibility", async () => {
    const configPath = join(dir, "settings.json");
    const { readGeminiConfigFrom, writeGeminiConfigTo } =
      await import("@/lib/gemini/config");
    writeGeminiConfigTo(configPath, {
      model: "gemini-2.5-flash",
      theme: "dark",
    });
    const cfg = readGeminiConfigFrom(configPath);
    expect(cfg.model).toEqual({ name: "gemini-2.5-flash" });
    expect(cfg.theme).toBe("dark");
  });

  it("resolves context file name from top-level contextFileName", async () => {
    const { resolveGeminiContextFileName } = await import("@/lib/gemini/config");
    expect(
      resolveGeminiContextFileName({ contextFileName: "PROJECT_CONTEXT.md" }),
    ).toBe("PROJECT_CONTEXT.md");
  });

  it("resolves context file name from nested context.fileName", async () => {
    const { resolveGeminiContextFileName } = await import("@/lib/gemini/config");
    expect(
      resolveGeminiContextFileName({ context: { fileName: "TEAM_GUIDE.md" } }),
    ).toBe("TEAM_GUIDE.md");
  });

  it("falls back to GEMINI.md when context file name is missing", async () => {
    const {
      DEFAULT_GEMINI_CONTEXT_FILE_NAME,
      resolveGeminiContextFileName,
    } = await import("@/lib/gemini/config");
    expect(resolveGeminiContextFileName({})).toBe(
      DEFAULT_GEMINI_CONTEXT_FILE_NAME,
    );
  });
});
