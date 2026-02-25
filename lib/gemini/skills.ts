import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { ensureProjectRecord } from "@/lib/projects/registry";
import { readGeminiSettingsFrom, writeGeminiSettingsTo } from "./settings";
import { GEMINI_CONFIG, getGeminiSkillDirs, projectGeminiConfig } from "./paths";

export interface GeminiSkill {
  name: string;
  content: string;
  provider: "gemini";
  origin: "user";
  visibility: "global" | "project";
  archived: false;
  filePath: string;
  projectPath?: string;
  projectName?: string;
  disabled?: boolean;
}

interface SkillPathCandidate {
  activePath: string;
  disabledPath: string;
  format: "package" | "flat";
  rootDir: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeSkillName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

function ensureSkillFrontmatter(
  safeName: string,
  content: string,
  description?: string,
): string {
  const normalized = content.trim();
  const frontmatterMatch = normalized.match(
    /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/,
  );
  const hasRequiredFrontmatter =
    frontmatterMatch &&
    /^\s*name\s*:/m.test(frontmatterMatch[1]) &&
    /^\s*description\s*:/m.test(frontmatterMatch[1]);

  if (hasRequiredFrontmatter) {
    return `${normalized}\n`;
  }

  const body = frontmatterMatch
    ? normalized.slice(frontmatterMatch[0].length).trimStart()
    : normalized;
  const safeDescription =
    (description || `Custom Gemini skill "${safeName}"`).replace(/"/g, '\\"');

  return `---\nname: ${safeName}\ndescription: "${safeDescription}"\n---\n\n${body}\n`;
}

function getGeminiSettingsPaths(projectPath?: string): string[] {
  const candidates = projectPath
    ? [projectGeminiConfig(projectPath)]
    : [path.join(process.cwd(), ".gemini", "settings.json"), GEMINI_CONFIG];
  const deduped = new Map<string, string>();
  for (const candidate of candidates) {
    deduped.set(path.resolve(candidate), candidate);
  }
  return Array.from(deduped.values());
}

function readDisabledSkillsFromSettings(settingsPath: string): Set<string> {
  const disabled = new Set<string>();
  let parsed: unknown;
  try {
    parsed = readGeminiSettingsFrom(settingsPath);
  } catch {
    return disabled;
  }
  if (!isPlainObject(parsed)) return disabled;
  const skills = parsed.skills;
  if (!isPlainObject(skills)) return disabled;
  const rawDisabled = skills.disabled;
  if (!Array.isArray(rawDisabled)) return disabled;
  for (const entry of rawDisabled) {
    if (typeof entry !== "string") continue;
    disabled.add(sanitizeSkillName(entry));
  }
  return disabled;
}

function readDisabledSkillSet(projectPath?: string): Set<string> {
  const disabled = new Set<string>();
  for (const settingsPath of getGeminiSettingsPaths(projectPath)) {
    for (const name of readDisabledSkillsFromSettings(settingsPath)) {
      disabled.add(name);
    }
  }
  return disabled;
}

function updateDisabledSkillsInSettings(
  settingsPath: string,
  updater: (set: Set<string>) => void,
): void {
  let parsed: unknown;
  try {
    parsed = readGeminiSettingsFrom(settingsPath);
  } catch {
    parsed = {};
  }
  const nextRoot: Record<string, unknown> = isPlainObject(parsed)
    ? { ...parsed }
    : {};
  const nextSkills: Record<string, unknown> = isPlainObject(nextRoot.skills)
    ? { ...(nextRoot.skills as Record<string, unknown>) }
    : {};
  const currentDisabled = new Set<string>();
  if (Array.isArray(nextSkills.disabled)) {
    for (const entry of nextSkills.disabled) {
      if (typeof entry !== "string") continue;
      currentDisabled.add(sanitizeSkillName(entry));
    }
  }
  updater(currentDisabled);
  if (currentDisabled.size > 0) {
    nextSkills.disabled = Array.from(currentDisabled).sort();
  } else {
    delete nextSkills.disabled;
  }
  if (Object.keys(nextSkills).length > 0) {
    nextRoot.skills = nextSkills;
  } else {
    delete nextRoot.skills;
  }
  writeGeminiSettingsTo(settingsPath, nextRoot);
}

function updateGeminiSkillDisabledState(
  name: string,
  disabled: boolean,
  projectPath?: string,
): void {
  const normalized = sanitizeSkillName(name);
  for (const settingsPath of getGeminiSettingsPaths(projectPath)) {
    try {
      updateDisabledSkillsInSettings(settingsPath, (set) => {
        if (disabled) {
          set.add(normalized);
        } else {
          set.delete(normalized);
        }
      });
    } catch {
      // Best-effort settings sync: skill file state remains authoritative fallback.
    }
  }
}

function listKnownProjectPaths(): Array<{ path: string; name: string }> {
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT path, name FROM projects")
      .all() as { path: string; name: string }[];
    return rows;
  } catch {
    return [];
  }
}

function listSkillsInDir(
  dir: string,
  meta: {
    visibility: "global" | "project";
    projectPath?: string;
    projectName?: string;
  },
  disabledSet?: Set<string>,
): GeminiSkill[] {
  if (!fs.existsSync(dir)) return [];
  const out: GeminiSkill[] = [];
  const pushSkill = (name: string, filePath: string) => {
    const content = fs.readFileSync(filePath, "utf-8");
    const normalizedName = sanitizeSkillName(name);
    const disabledBySettings = disabledSet?.has(normalizedName) ?? false;
    out.push({
      name: normalizedName,
      content,
      provider: "gemini",
      origin: "user",
      visibility: meta.visibility,
      archived: false,
      filePath,
      projectPath: meta.projectPath,
      projectName: meta.projectName,
      disabled: filePath.endsWith(".disabled") || disabledBySettings,
    });
  };

  const walkSkillDirs = (currentDir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const entryPath = path.join(currentDir, entry.name);
      const skillPath = path.join(entryPath, "SKILL.md");
      const disabledSkillPath = `${skillPath}.disabled`;

      if (fs.existsSync(skillPath)) {
        pushSkill(entry.name, skillPath);
      } else if (fs.existsSync(disabledSkillPath)) {
        pushSkill(entry.name, disabledSkillPath);
      }

      walkSkillDirs(entryPath);
    }
  };

  // Prefer package-style skills so CLI-compatible entries win on dedupe.
  walkSkillDirs(dir);

  let topLevel: fs.Dirent[];
  try {
    topLevel = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of topLevel) {
    if (!entry.isFile()) continue;
    const fileName = entry.name;
    if (!fileName.endsWith(".md") && !fileName.endsWith(".md.disabled")) continue;
    const filePath = path.join(dir, fileName);
    pushSkill(fileName.replace(/\.md(\.disabled)?$/, ""), filePath);
  }

  return out;
}

export function listGeminiSkills(
  projectPaths?: Array<{ path: string; name?: string }> | string[],
): GeminiSkill[] {
  const out: GeminiSkill[] = [];
  const seen = new Set<string>();
  const appendUnique = (items: GeminiSkill[]) => {
    for (const item of items) {
      const key = `${item.visibility}:${item.projectPath || ""}:${item.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  };

  const globalDisabled = readDisabledSkillSet();
  for (const dir of getGeminiSkillDirs()) {
    appendUnique(
      listSkillsInDir(dir, { visibility: "global" }, globalDisabled),
    );
  }

  const candidates =
    projectPaths && projectPaths.length > 0
      ? projectPaths
      : listKnownProjectPaths();
  for (const item of candidates) {
    const projectPath =
      typeof item === "string" ? item : (item.path as string | undefined);
    if (!projectPath) continue;
    const projectName =
      typeof item === "string"
        ? path.basename(projectPath)
        : item.name || path.basename(projectPath);
    const projectDisabled = readDisabledSkillSet(projectPath);
    for (const dir of getGeminiSkillDirs(projectPath)) {
      appendUnique(
        listSkillsInDir(
          dir,
          {
            visibility: "project",
            projectPath,
            projectName,
          },
          projectDisabled,
        ),
      );
    }
  }
  return out;
}

function getSkillPathCandidates(
  name: string,
  projectPath?: string,
): SkillPathCandidate[] {
  const safe = sanitizeSkillName(name);
  const candidates: SkillPathCandidate[] = [];

  for (const dir of getGeminiSkillDirs(projectPath)) {
    const packagePath = path.join(dir, safe, "SKILL.md");
    candidates.push({
      activePath: packagePath,
      disabledPath: `${packagePath}.disabled`,
      format: "package",
      rootDir: dir,
    });

    const flatPath = path.join(dir, `${safe}.md`);
    candidates.push({
      activePath: flatPath,
      disabledPath: `${flatPath}.disabled`,
      format: "flat",
      rootDir: dir,
    });
  }

  return candidates;
}

function preferredSkillPathCandidate(
  name: string,
  projectPath?: string,
): SkillPathCandidate {
  const candidates = getSkillPathCandidates(name, projectPath);
  if (candidates.length === 0) {
    throw new Error("No Gemini skill directory candidates available");
  }
  return candidates[0];
}

function pruneEmptySkillDir(candidate: SkillPathCandidate): void {
  if (candidate.format !== "package") return;

  let current = path.dirname(candidate.activePath);
  while (current.startsWith(candidate.rootDir) && current !== candidate.rootDir) {
    let entries: string[];
    try {
      entries = fs.readdirSync(current);
    } catch {
      return;
    }
    if (entries.length > 0) return;
    try {
      fs.rmdirSync(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

export function getGeminiSkill(
  name: string,
  projectPath?: string,
): GeminiSkill | null {
  const normalizedName = sanitizeSkillName(name);
  let foundPath: string | null = null;
  for (const candidate of getSkillPathCandidates(name, projectPath)) {
    if (fs.existsSync(candidate.activePath)) {
      foundPath = candidate.activePath;
      break;
    }
    if (fs.existsSync(candidate.disabledPath)) {
      foundPath = candidate.disabledPath;
      break;
    }
  }
  if (!foundPath) return null;
  const disabledSet = readDisabledSkillSet(projectPath);
  return {
    name: normalizedName,
    content: fs.readFileSync(foundPath, "utf-8"),
    provider: "gemini",
    origin: "user",
    visibility: projectPath ? "project" : "global",
    archived: false,
    filePath: foundPath,
    projectPath,
    projectName: projectPath ? path.basename(projectPath) : undefined,
    disabled: foundPath.endsWith(".disabled") || disabledSet.has(normalizedName),
  };
}

export function saveGeminiSkill(
  name: string,
  content: string,
  projectPath?: string,
  description?: string,
): string {
  if (projectPath) {
    try {
      ensureProjectRecord(projectPath, path.basename(projectPath));
    } catch {
      // Project registry backfill is best-effort; skill save must still succeed.
    }
  }

  const normalizedName = sanitizeSkillName(name);
  const withFrontmatter = ensureSkillFrontmatter(
    normalizedName,
    content,
    description,
  );
  const preferred = preferredSkillPathCandidate(name, projectPath);
  const filePath = preferred.activePath;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, withFrontmatter, "utf-8");

  for (const candidate of getSkillPathCandidates(name, projectPath)) {
    if (candidate.disabledPath !== preferred.disabledPath && fs.existsSync(candidate.disabledPath)) {
      fs.unlinkSync(candidate.disabledPath);
      pruneEmptySkillDir(candidate);
    }
    if (candidate.activePath !== preferred.activePath && fs.existsSync(candidate.activePath)) {
      fs.unlinkSync(candidate.activePath);
      pruneEmptySkillDir(candidate);
    }
  }

  if (fs.existsSync(preferred.disabledPath)) {
    fs.unlinkSync(preferred.disabledPath);
  }
  updateGeminiSkillDisabledState(normalizedName, false, projectPath);
  return filePath;
}

export function deleteGeminiSkill(name: string, projectPath?: string): boolean {
  let deleted = false;
  for (const candidate of getSkillPathCandidates(name, projectPath)) {
    if (fs.existsSync(candidate.activePath)) {
      fs.unlinkSync(candidate.activePath);
      pruneEmptySkillDir(candidate);
      deleted = true;
    }
    if (fs.existsSync(candidate.disabledPath)) {
      fs.unlinkSync(candidate.disabledPath);
      pruneEmptySkillDir(candidate);
      deleted = true;
    }
  }
  if (deleted) {
    updateGeminiSkillDisabledState(name, false, projectPath);
  }
  return deleted;
}

export function setGeminiSkillDisabled(
  name: string,
  disabled: boolean,
  projectPath?: string,
): boolean {
  const normalizedName = sanitizeSkillName(name);
  const candidates = getSkillPathCandidates(name, projectPath);
  const preferred = preferredSkillPathCandidate(name, projectPath);
  let found = false;

  // Migrate legacy *.disabled files back to active path so Gemini CLI can
  // discover skills and use settings-based disable parity.
  for (const candidate of candidates) {
    if (fs.existsSync(candidate.activePath)) {
      found = true;
    }
    if (!fs.existsSync(candidate.disabledPath)) continue;
    found = true;
    fs.mkdirSync(path.dirname(candidate.activePath), { recursive: true });
    if (fs.existsSync(candidate.activePath)) {
      fs.unlinkSync(candidate.disabledPath);
    } else {
      fs.renameSync(candidate.disabledPath, candidate.activePath);
    }
  }

  if (!found) {
    return false;
  }

  const existingActive = candidates.find((candidate) =>
    fs.existsSync(candidate.activePath),
  );
  const destinationPath = preferred.activePath;
  if (existingActive && existingActive.activePath !== destinationPath) {
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    if (!fs.existsSync(destinationPath)) {
      fs.renameSync(existingActive.activePath, destinationPath);
    } else {
      fs.unlinkSync(existingActive.activePath);
    }
  }

  for (const candidate of candidates) {
    for (const filePath of [candidate.activePath, candidate.disabledPath]) {
      if (filePath === preferred.activePath) continue;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        pruneEmptySkillDir(candidate);
      }
    }
  }

  updateGeminiSkillDisabledState(normalizedName, disabled, projectPath);
  return true;
}
