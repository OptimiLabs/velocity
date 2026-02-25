import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readToml, writeToml } from "@/lib/codex/toml";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("readToml", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "toml-test-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("parses valid TOML file", () => {
    const f = join(dir, "config.toml");
    writeFileSync(f, 'model = "o3"\napproval_mode = "suggest"\n');
    const result = readToml<{ model: string; approval_mode: string }>(f);
    expect(result.model).toBe("o3");
    expect(result.approval_mode).toBe("suggest");
  });

  it("returns empty object for missing file", () => {
    const result = readToml(join(dir, "nope.toml"));
    expect(result).toEqual({});
  });
});

describe("writeToml", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "toml-test-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips data", () => {
    const f = join(dir, "out.toml");
    writeToml(f, { model: "o3", sandbox: { enable: true } });
    const result = readToml<{ model: string; sandbox: { enable: boolean } }>(f);
    expect(result.model).toBe("o3");
    expect(result.sandbox.enable).toBe(true);
  });
});
