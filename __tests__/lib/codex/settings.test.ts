import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  readCodexSettingsFrom,
  writeCodexSettingsTo,
} from "@/lib/codex/settings";

describe("readCodexSettingsFrom", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "codex-settings-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads and normalizes settings from TOML", () => {
    const f = join(dir, "config.toml");
    writeFileSync(
      f,
      'model = "o3"\napproval_mode = "full-auto"\n\n[sandbox]\nenable = true\n',
    );
    const settings = readCodexSettingsFrom(f);
    expect(settings.model).toBe("o3");
    expect(settings.approval_mode).toBe("full-auto");
    expect(settings.sandbox?.enable).toBe(true);
  });

  it("returns empty settings for missing file", () => {
    const settings = readCodexSettingsFrom(join(dir, "nope.toml"));
    expect(settings).toEqual({});
  });
});

describe("writeCodexSettingsTo", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "codex-settings-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips settings through TOML", () => {
    const f = join(dir, "config.toml");
    writeCodexSettingsTo(f, { model: "o4-mini", approval_mode: "suggest" });
    const settings = readCodexSettingsFrom(f);
    expect(settings.model).toBe("o4-mini");
    expect(settings.approval_mode).toBe("suggest");
  });
});
