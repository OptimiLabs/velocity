import os from "os";
import path from "path";

export const MAX_SKILL_NAME_LENGTH = 64;
const NORMALIZED_SKILL_NAME = /^[a-z0-9][a-z0-9_-]*$/;

export interface SkillValidationResult {
  ok: boolean;
  code?: string;
  error?: string;
}

export function normalizeSkillName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function validateNormalizedSkillName(name: string): SkillValidationResult {
  if (!name) {
    return {
      ok: false,
      code: "INVALID_SKILL_NAME",
      error: "Skill name is required",
    };
  }
  if (name.length > MAX_SKILL_NAME_LENGTH) {
    return {
      ok: false,
      code: "INVALID_SKILL_NAME",
      error: `Skill name must be ${MAX_SKILL_NAME_LENGTH} characters or fewer`,
    };
  }
  if (!NORMALIZED_SKILL_NAME.test(name)) {
    return {
      ok: false,
      code: "INVALID_SKILL_NAME",
      error:
        "Skill name must start with a letter or number and use only lowercase letters, numbers, hyphens, or underscores",
    };
  }
  return { ok: true };
}

export function assertSafeSkillPathSegment(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Skill name is required");
  }
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new Error("Skill name must not contain path separators or '..'");
  }
  if (trimmed.includes("\0")) {
    throw new Error("Skill name contains invalid characters");
  }
  return trimmed;
}

export function normalizeProjectPath(projectPath: string): string {
  const trimmed = projectPath.trim();
  if (!trimmed) {
    throw new Error("Project path is required");
  }
  if (trimmed.includes("\0")) {
    throw new Error("Project path contains invalid characters");
  }
  const expanded = trimmed.startsWith("~")
    ? path.join(os.homedir(), trimmed.slice(1))
    : trimmed;
  return path.resolve(expanded);
}
