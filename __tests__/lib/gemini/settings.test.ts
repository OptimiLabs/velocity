import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  readGeminiSettingsFrom,
  writeGeminiSettingsTo,
} from "@/lib/gemini/settings";

describe("readGeminiSettingsFrom", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gemini-settings-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads settings from JSON", () => {
    const f = join(dir, "settings.json");
    writeFileSync(
      f,
      JSON.stringify({
        selectedAuthType: "oauth",
        theme: "dark",
        selectedModel: "gemini-2.5-pro",
      }),
    );
    const settings = readGeminiSettingsFrom(f);
    expect(settings.selectedAuthType).toBe("oauth");
    expect(settings.theme).toBe("dark");
    expect(settings.selectedModel).toBe("gemini-2.5-pro");
  });

  it("returns empty for missing file", () => {
    expect(readGeminiSettingsFrom(join(dir, "nope.json"))).toEqual({});
  });

  it("returns empty for malformed JSON", () => {
    const f = join(dir, "settings.json");
    writeFileSync(f, "not json");
    expect(readGeminiSettingsFrom(f)).toEqual({});
  });
});

describe("writeGeminiSettingsTo", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gemini-settings-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips settings", () => {
    const f = join(dir, "settings.json");
    writeGeminiSettingsTo(f, {
      selectedAuthType: "api-key",
      selectedModel: "gemini-2.5-flash",
    });
    const settings = readGeminiSettingsFrom(f);
    expect(settings.selectedAuthType).toBe("api-key");
    expect(settings.selectedModel).toBe("gemini-2.5-flash");
  });
});
