import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  assertSafeSkillPathSegment,
  normalizeProjectPath,
  normalizeSkillName,
  validateNormalizedSkillName,
} from "@/lib/skills-validation";

describe("skills-validation", () => {
  it("normalizes arbitrary user input into a slug-safe skill name", () => {
    expect(normalizeSkillName("  My Fancy Skill  ")).toBe("my-fancy-skill");
    expect(normalizeSkillName("READ__FILES!!")).toBe("read__files");
  });

  it("rejects invalid normalized names", () => {
    expect(validateNormalizedSkillName("")).toMatchObject({
      ok: false,
      code: "INVALID_SKILL_NAME",
    });
    expect(validateNormalizedSkillName("bad/name")).toMatchObject({
      ok: false,
      code: "INVALID_SKILL_NAME",
    });
  });

  it("accepts valid normalized names", () => {
    expect(validateNormalizedSkillName("code-review_v2")).toEqual({ ok: true });
  });

  it("blocks unsafe path segments", () => {
    expect(() => assertSafeSkillPathSegment("../escape")).toThrow(
      /must not contain/i,
    );
    expect(() => assertSafeSkillPathSegment("nested/name")).toThrow(
      /must not contain/i,
    );
    expect(assertSafeSkillPathSegment("safe-name")).toBe("safe-name");
  });

  it("normalizes project paths, including home-relative paths", () => {
    const expected = path.resolve(path.join(os.homedir(), "demo-project"));
    expect(normalizeProjectPath("~/demo-project")).toBe(expected);
    expect(normalizeProjectPath(" ./tmp ")).toBe(path.resolve("./tmp"));
  });
});
