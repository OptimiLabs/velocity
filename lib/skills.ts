import {
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  mkdirSync,
  existsSync,
  rmSync,
  statSync,
  renameSync,
} from "fs";
import { join, resolve, dirname, basename } from "path";
import matter from "gray-matter";
import {
  SKILLS_DIR,
  LEGACY_SKILLS_DIR,
  ARCHIVE_SKILLS_DIR,
  PLUGINS_DIR,
  DISABLED_SKILLS_DIR,
} from "./claude-paths";
import { getDb } from "./db";
import { skillLog } from "@/lib/logger";
import {
  assertSafeSkillPathSegment,
  normalizeProjectPath,
} from "@/lib/skills-validation";

// Re-export client-safe types/constants so server-side consumers don't need to change imports
export { SKILL_CATEGORY_LABELS } from "./skills-shared";
export type { SkillCategory } from "./skills-shared";
import type { SkillCategory } from "./skills-shared";

export interface Skill {
  name: string;
  description?: string;
  content: string;
  isCustom: boolean;
  disabled?: boolean;
  category?: SkillCategory;
}

export interface SkillWithScope extends Skill {
  origin: "user" | "plugin";
  visibility: "global" | "project";
  archived: boolean;
  projectPath?: string;
  projectName?: string;
  inheritedFrom?: string; // ancestor dir path if discovered via parent traversal
}

/**
 * Derive the skill name from its file_name and file_path.
 * Modern skills live at `.claude/skills/<name>/SKILL.md` — the name comes from the directory.
 * Legacy skills live at `.claude/commands/<name>.md` — the name comes from the filename.
 */
export function deriveSkillName(fileName: string, filePath: string): string {
  if (fileName === "SKILL.md" || fileName === "SKILL.md.disabled") {
    return basename(dirname(filePath));
  }
  return fileName.replace(/\.md(\.disabled)?$/, "");
}

export function listCustomSkills(): Skill[] {
  // Prefer DB: instruction indexer already stores all skill files
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT file_path, file_name, content, is_active FROM instruction_files
       WHERE file_type = 'skill.md' AND project_path IS NULL`,
    )
    .all() as { file_path: string; file_name: string; content: string; is_active: number }[];

  return rows.map((row) => {
    let content = row.content || "";
    let name = deriveSkillName(row.file_name, row.file_path);
    let description: string | undefined;
    const disabled = row.is_active === 0;

    let category: SkillCategory | undefined;

    try {
      const parsed = matter(content);
      content = parsed.content.trim();
      if (parsed.data.name) name = parsed.data.name;
      if (parsed.data.description) description = parsed.data.description;
      if (parsed.data.category) category = parsed.data.category;
    } catch (err) {
      skillLog.debug("parse failed", err, { path: row.file_path });
      /* use raw */
    }

    return { name, description, content, isCustom: true, disabled, category };
  });
}

/** Filesystem fallback for listCustomSkills — used before indexer has run. */

/**
 * Look up a single skill by name, searching in priority order:
 * 1. Modern path: `~/.claude/skills/<name>/SKILL.md`
 * 2. Untracked disabled: `~/.claude/.disabled/skills/<name>/SKILL.md`
 * 3. Modern disabled (legacy): `~/.claude/skills/<name>/SKILL.md.disabled`
 * 4. Legacy path: `~/.claude/commands/<name>.md`
 *
 * Returns the first match found, or null if the skill doesn't exist
 * in any location.
 */
export function getSkill(name: string): Skill | null {
  const safeName = assertSafeSkillPathSegment(name);
  const modernPath = join(SKILLS_DIR, safeName, "SKILL.md");
  const disabledUntrackedPath = join(DISABLED_SKILLS_DIR, safeName, "SKILL.md");
  const disabledModernPath = join(SKILLS_DIR, safeName, "SKILL.md.disabled");
  const legacyPath = join(LEGACY_SKILLS_DIR, `${safeName}.md`);
  const candidates: { path: string; disabled: boolean }[] = [
    { path: modernPath, disabled: false },
    { path: disabledUntrackedPath, disabled: true },
    { path: disabledModernPath, disabled: true },
    { path: legacyPath, disabled: false },
  ];
  for (const { path: filePath, disabled } of candidates) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const { data, content } = matter(raw);
      return {
        name: data.name || name,
        description: data.description || undefined,
        content: content.trim(),
        isCustom: true,
        disabled,
        category: data.category || undefined,
      };
    } catch {
      // Expected: file may not exist
      continue;
    }
  }
  return null;
}

export function setSkillDisabled(name: string, disabled: boolean): boolean {
  const safeName = assertSafeSkillPathSegment(name);
  const modernPath = join(SKILLS_DIR, safeName, "SKILL.md");
  const disabledUntrackedPath = join(DISABLED_SKILLS_DIR, safeName, "SKILL.md");
  const disabledModernPath = join(SKILLS_DIR, safeName, "SKILL.md.disabled");
  const legacyPath = join(LEGACY_SKILLS_DIR, `${safeName}.md`);

  // Determine source → destination based on disable/enable.
  // We prefer untracked disabled storage, while preserving legacy compatibility.
  const candidates: { from: string; to: string }[] = disabled
    ? [
        { from: modernPath, to: disabledUntrackedPath },
        { from: modernPath, to: disabledModernPath }, // legacy fallback
        { from: legacyPath, to: legacyPath }, // legacy stays in place, just DB flag
      ]
    : [
        { from: disabledUntrackedPath, to: modernPath },
        { from: disabledModernPath, to: modernPath },
        { from: legacyPath, to: legacyPath },
      ];

  for (const { from, to } of candidates) {
    try {
      if (!existsSync(from)) continue;
      if (from !== to) {
        mkdirSync(dirname(to), { recursive: true });
        renameSync(from, to);
      }

      // Update DB row
      const db = getDb();
      db.prepare(
        "UPDATE instruction_files SET is_active = ?, updated_at = ? WHERE file_path = ? OR file_path = ?",
      ).run(disabled ? 0 : 1, new Date().toISOString(), from, to);

      return true;
    } catch (err) {
      skillLog.warn("operation failed", err);
      continue;
    }
  }
  return false;
}

export function setProjectSkillDisabled(
  projectPath: string,
  name: string,
  disabled: boolean,
): boolean {
  const safeName = assertSafeSkillPathSegment(name);
  const safeProjectPath = normalizeProjectPath(projectPath);
  const activePath = join(safeProjectPath, ".claude", "skills", safeName, "SKILL.md");
  const disabledUntrackedPath = join(
    safeProjectPath,
    ".claude.local",
    "disabled",
    "skills",
    safeName,
    "SKILL.md",
  );
  const disabledLegacyPath = join(
    safeProjectPath,
    ".claude",
    "skills",
    safeName,
    "SKILL.md.disabled",
  );

  const candidates: { from: string; to: string }[] = disabled
    ? [
        { from: activePath, to: disabledUntrackedPath },
        { from: activePath, to: disabledLegacyPath },
      ]
    : [
        { from: disabledUntrackedPath, to: activePath },
        { from: disabledLegacyPath, to: activePath },
      ];

  for (const { from, to } of candidates) {
    try {
      if (!existsSync(from)) continue;
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);

      // Update DB row
      const db = getDb();
      db.prepare(
        "UPDATE instruction_files SET is_active = ?, updated_at = ? WHERE file_path = ? OR file_path = ?",
      ).run(disabled ? 0 : 1, new Date().toISOString(), from, to);

      return true;
    } catch (err) {
      skillLog.warn("operation failed", err);
      continue;
    }
  }
  return false;
}

export function saveSkill(
  name: string,
  description: string | undefined,
  content: string,
  category?: SkillCategory,
): void {
  const safeName = assertSafeSkillPathSegment(name);
  const skillDir = join(SKILLS_DIR, safeName);
  mkdirSync(skillDir, { recursive: true });
  const frontmatter: Record<string, string> = { name: safeName };
  if (description) frontmatter.description = description;
  if (category) frontmatter.category = category;
  const md = matter.stringify(content, frontmatter);
  const fullPath = join(skillDir, "SKILL.md");
  writeFileSync(fullPath, md, "utf-8");

  // Upsert instruction_files row
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT id FROM instruction_files WHERE file_path = ?")
    .get(fullPath) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE instruction_files SET content = ?, description = ?, updated_at = ? WHERE id = ?",
    ).run(md, description || "", now, existing.id);
  } else {
    const id = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(
      `INSERT INTO instruction_files (id, file_path, file_type, file_name, content, description, last_indexed_at, created_at, updated_at)
       VALUES (?, ?, 'skill.md', ?, ?, ?, ?, ?, ?)`,
    ).run(id, fullPath, `${safeName}.md`, md, description || "", now, now, now);
  }
}

export function deleteSkill(name: string): boolean {
  const safeName = assertSafeSkillPathSegment(name);
  let deleted = false;
  // Remove modern directory
  const skillDir = join(SKILLS_DIR, safeName);
  try {
    rmSync(skillDir, { recursive: true });
    deleted = true;
  } catch {
    // Expected: file may not exist
  }
  // Also remove legacy flat file if it exists
  const legacyPath = join(LEGACY_SKILLS_DIR, `${safeName}.md`);
  try {
    unlinkSync(legacyPath);
    deleted = true;
  } catch {
    // Expected: file may not exist
  }

  // Remove DB rows
  const db = getDb();
  const modernPath = join(SKILLS_DIR, safeName, "SKILL.md");
  db.prepare("DELETE FROM instruction_files WHERE file_path IN (?, ?)").run(
    modernPath,
    legacyPath,
  );

  return deleted;
}

// --- Project-scoped skills ---

export function listProjectSkills(): SkillWithScope[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT inf.file_path, inf.file_name, inf.content, inf.description, inf.project_path,
              inf.is_active, p.name as project_name
       FROM instruction_files inf
       LEFT JOIN projects p ON inf.project_id = p.id
       WHERE inf.file_type = 'skill.md' AND inf.project_path IS NOT NULL`,
    )
    .all() as {
    file_path: string;
    file_name: string;
    content: string;
    description: string;
    project_path: string;
    is_active: number;
    project_name: string | null;
  }[];

  return rows.map((row) => {
    const name = deriveSkillName(row.file_name, row.file_path);
    let content = row.content || "";
    let description = row.description || undefined;
    const disabled = row.is_active === 0;
    let category: SkillCategory | undefined;

    // Try to parse frontmatter from content
    try {
      const parsed = matter(content);
      content = parsed.content.trim();
      if (parsed.data.description) description = parsed.data.description;
      if (parsed.data.category) category = parsed.data.category;
    } catch (err) {
      skillLog.debug("parse failed", err, { path: row.file_path });
      // Use raw content
    }

    // Detect inherited skills: file_path is NOT under project_path/.claude/
    const projectClaudePrefix = join(row.project_path, ".claude");
    const isInherited = !row.file_path.startsWith(projectClaudePrefix);

    return {
      name,
      description,
      content,
      isCustom: true,
      disabled,
      category,
      origin: "user" as const,
      visibility: "project" as const,
      archived: false,
      projectPath: row.project_path,
      projectName:
        row.project_name || row.project_path.split("/").pop() || "unknown",
      inheritedFrom: isInherited
        ? row.file_path.split("/.claude/")[0]
        : undefined,
    };
  });
}

export function getProjectSkill(
  projectPath: string,
  name: string,
): Skill | null {
  const safeName = assertSafeSkillPathSegment(name);
  const safeProjectPath = normalizeProjectPath(projectPath);
  // Try active path first, then disabled/untracked fallbacks, then legacy
  const modernPath = join(safeProjectPath, ".claude", "skills", safeName, "SKILL.md");
  const disabledUntrackedPath = join(
    safeProjectPath,
    ".claude.local",
    "disabled",
    "skills",
    safeName,
    "SKILL.md",
  );
  const disabledLegacyPath = join(
    safeProjectPath,
    ".claude",
    "skills",
    safeName,
    "SKILL.md.disabled",
  );
  const legacyPath = join(safeProjectPath, ".claude", "commands", `${safeName}.md`);
  for (const filePath of [
    modernPath,
    disabledUntrackedPath,
    disabledLegacyPath,
    legacyPath,
  ]) {
    try {
      const raw = readFileSync(filePath, "utf-8");
      const { data, content } = matter(raw);
      return {
        name: data.name || safeName,
        description: data.description || undefined,
        content: content.trim(),
        isCustom: true,
        category: data.category || undefined,
      };
    } catch {
      // Expected: file may not exist
      continue;
    }
  }
  return null;
}

export function saveProjectSkill(
  projectPath: string,
  name: string,
  description: string | undefined,
  content: string,
  category?: SkillCategory,
): void {
  const safeName = assertSafeSkillPathSegment(name);
  const safeProjectPath = normalizeProjectPath(projectPath);
  const skillDir = join(safeProjectPath, ".claude", "skills", safeName);
  mkdirSync(skillDir, { recursive: true });
  const frontmatter: Record<string, string> = { name: safeName };
  if (description) frontmatter.description = description;
  if (category) frontmatter.category = category;
  const md = matter.stringify(content, frontmatter);
  const filePath = join(skillDir, "SKILL.md");
  writeFileSync(filePath, md, "utf-8");

  // Upsert instruction_files row
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db
    .prepare("SELECT id FROM instruction_files WHERE file_path = ?")
    .get(filePath) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE instruction_files SET content = ?, description = ?, updated_at = ? WHERE id = ?`,
    ).run(md, description || "", now, existing.id);
  } else {
    const id = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Find project_id
    const project = db
      .prepare("SELECT id FROM projects WHERE path = ?")
      .get(safeProjectPath) as { id: string } | undefined;

    db.prepare(
      `INSERT INTO instruction_files (id, file_path, file_type, project_path, project_id, file_name, content, description, last_indexed_at, created_at, updated_at)
       VALUES (?, ?, 'skill.md', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      filePath,
      safeProjectPath,
      project?.id || null,
      `${safeName}.md`,
      md,
      description || "",
      now,
      now,
      now,
    );
  }
}

export function deleteProjectSkill(
  projectPath: string,
  name: string,
): boolean {
  const safeName = assertSafeSkillPathSegment(name);
  const safeProjectPath = normalizeProjectPath(projectPath);
  const skillDir = join(safeProjectPath, ".claude", "skills", safeName);
  try {
    rmSync(skillDir, { recursive: true });
  } catch (err) {
    skillLog.warn("operation failed", err);
    return false;
  }
  // Remove DB row
  const db = getDb();
  const filePath = join(skillDir, "SKILL.md");
  db.prepare("DELETE FROM instruction_files WHERE file_path = ?").run(filePath);
  return true;
}

/**
 * List all skills (global + project-scoped), deduplicating by name.
 * Global skills take priority — if the same skill name exists in both
 * the global directory and a project directory, only the global version
 * is included. Project-scoped skills that don't collide are appended.
 */
export function listAllSkills(): SkillWithScope[] {
  const globalSkills = listCustomSkills().map(
    (s): SkillWithScope => ({
      ...s,
      origin: "user",
      visibility: "global",
      archived: false,
    }),
  );
  const globalNames = new Set(globalSkills.map((s) => s.name));
  const projectSkills = listProjectSkills().filter(
    (s) => !globalNames.has(s.name),
  );
  return [...globalSkills, ...projectSkills];
}

// --- Archive functions ---


export function archiveSkill(
  name: string,
  projectPath?: string,
  pluginFilePath?: string,
): boolean {
  if (pluginFilePath) {
    return archivePluginSkill(pluginFilePath);
  }
  if (projectPath) {
    return archiveProjectSkill(projectPath, name);
  }
  return archiveGlobalSkill(name);
}

function archiveGlobalSkill(name: string): boolean {
  // Try modern path first, then legacy
  const modernSrc = join(SKILLS_DIR, name, "SKILL.md");
  const legacySrc = join(LEGACY_SKILLS_DIR, `${name}.md`);
  const destDir = join(ARCHIVE_SKILLS_DIR, name);
  const dest = join(destDir, "SKILL.md");
  try {
    let content: string;
    let srcDir: string | null = null;
    if (existsSync(modernSrc)) {
      content = readFileSync(modernSrc, "utf-8");
      srcDir = join(SKILLS_DIR, name);
    } else {
      content = readFileSync(legacySrc, "utf-8");
    }
    mkdirSync(destDir, { recursive: true });
    writeFileSync(dest, content, "utf-8");
    if (srcDir) {
      rmSync(srcDir, { recursive: true });
    } else {
      unlinkSync(legacySrc);
    }

    // Update DB: mark as inactive
    const db = getDb();
    const dbFilePath = srcDir ? modernSrc : legacySrc;
    db.prepare(
      "UPDATE instruction_files SET is_active = 0, updated_at = ? WHERE file_path = ?",
    ).run(new Date().toISOString(), dbFilePath);

    return true;
  } catch (err) {
    skillLog.warn("operation failed", err);
    return false;
  }
}

function archiveProjectSkill(projectPath: string, name: string): boolean {
  const srcDir = join(projectPath, ".claude", "skills", name);
  const src = join(srcDir, "SKILL.md");
  const archiveDir = join(projectPath, ".claude", "archive", "skills", name);
  const dest = join(archiveDir, "SKILL.md");
  try {
    mkdirSync(archiveDir, { recursive: true });
    const content = readFileSync(src, "utf-8");
    writeFileSync(dest, content, "utf-8");
    rmSync(srcDir, { recursive: true });

    // Update DB: mark as inactive
    const db = getDb();
    db.prepare(
      "UPDATE instruction_files SET is_active = 0, updated_at = ? WHERE file_path = ?",
    ).run(new Date().toISOString(), src);

    return true;
  } catch (err) {
    skillLog.warn("operation failed", err);
    return false;
  }
}

function archivePluginSkill(filePath: string): boolean {
  // Safety: only allow deletion within ~/.claude/plugins/
  const skillDir = resolve(filePath, "..");
  if (!skillDir.startsWith(PLUGINS_DIR)) {
    return false;
  }
  try {
    rmSync(skillDir, { recursive: true });

    // Update DB: mark as inactive
    const db = getDb();
    db.prepare(
      "UPDATE instruction_files SET is_active = 0, updated_at = ? WHERE file_path = ?",
    ).run(new Date().toISOString(), filePath);

    return true;
  } catch (err) {
    skillLog.warn("operation failed", err);
    return false;
  }
}

export function restoreSkill(
  name: string,
  projectPath?: string,
): boolean {
  if (projectPath) {
    return restoreProjectSkill(projectPath, name);
  }
  return restoreGlobalSkill(name);
}

function restoreGlobalSkill(name: string): boolean {
  const srcDir = join(ARCHIVE_SKILLS_DIR, name);
  const src = join(srcDir, "SKILL.md");
  const destDir = join(SKILLS_DIR, name);
  const dest = join(destDir, "SKILL.md");
  try {
    mkdirSync(destDir, { recursive: true });
    const content = readFileSync(src, "utf-8");
    writeFileSync(dest, content, "utf-8");
    rmSync(srcDir, { recursive: true });

    // Update DB: mark as active
    const db = getDb();
    db.prepare(
      "UPDATE instruction_files SET is_active = 1, updated_at = ? WHERE file_path = ?",
    ).run(new Date().toISOString(), dest);

    return true;
  } catch (err) {
    skillLog.warn("operation failed", err);
    return false;
  }
}

function restoreProjectSkill(projectPath: string, name: string): boolean {
  const archiveSrcDir = join(projectPath, ".claude", "archive", "skills", name);
  const src = join(archiveSrcDir, "SKILL.md");
  const destDir = join(projectPath, ".claude", "skills", name);
  const dest = join(destDir, "SKILL.md");
  try {
    mkdirSync(destDir, { recursive: true });
    const content = readFileSync(src, "utf-8");
    writeFileSync(dest, content, "utf-8");
    rmSync(archiveSrcDir, { recursive: true });

    // Update DB: mark as active
    const db = getDb();
    db.prepare(
      "UPDATE instruction_files SET is_active = 1, updated_at = ? WHERE file_path = ?",
    ).run(new Date().toISOString(), dest);

    return true;
  } catch (err) {
    skillLog.warn("operation failed", err);
    return false;
  }
}

export function listArchivedSkills(): SkillWithScope[] {
  const globalArchived = listArchivedGlobalSkills();
  const projectArchived = listArchivedProjectSkills();
  return [...globalArchived, ...projectArchived];
}

function listArchivedGlobalSkills(): SkillWithScope[] {
  if (!existsSync(ARCHIVE_SKILLS_DIR)) return [];
  const skills: SkillWithScope[] = [];
  for (const entry of readdirSync(ARCHIVE_SKILLS_DIR)) {
    const skillFile = join(ARCHIVE_SKILLS_DIR, entry, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    try {
      if (!statSync(join(ARCHIVE_SKILLS_DIR, entry)).isDirectory()) continue;
    } catch {
      // Expected: file may not exist
      continue;
    }
    const raw = readFileSync(skillFile, "utf-8");
    const { data, content } = matter(raw);
    skills.push({
      name: data.name || entry,
      description: data.description || undefined,
      content: content.trim(),
      isCustom: true,
      disabled: true,
      category: data.category || undefined,
      origin: "user" as const,
      visibility: "global" as const,
      archived: true,
    });
  }
  return skills;
}

function listArchivedProjectSkills(): SkillWithScope[] {
  const db = getDb();
  // Find archived project skills via DB (is_active = 0)
  const rows = db
    .prepare(
      `SELECT inf.file_path, inf.file_name, inf.content, inf.description, inf.project_path,
              p.name as project_name
       FROM instruction_files inf
       LEFT JOIN projects p ON inf.project_id = p.id
       WHERE inf.file_type = 'skill.md' AND inf.project_path IS NOT NULL AND inf.is_active = 0`,
    )
    .all() as {
    file_path: string;
    file_name: string;
    content: string;
    description: string;
    project_path: string;
    project_name: string | null;
  }[];

  return rows.map((row) => {
    const name = deriveSkillName(row.file_name, row.file_path);
    let content = row.content || "";
    let description = row.description || undefined;
    let category: SkillCategory | undefined;

    try {
      const parsed = matter(content);
      content = parsed.content.trim();
      if (parsed.data.description) description = parsed.data.description;
      if (parsed.data.category) category = parsed.data.category;
    } catch (err) {
      skillLog.debug("parse failed", err, { path: row.file_path });
      // Use raw content
    }

    return {
      name,
      description,
      content,
      isCustom: true,
      disabled: true,
      category,
      origin: "user" as const,
      visibility: "project" as const,
      archived: true,
      projectPath: row.project_path,
      projectName:
        row.project_name || row.project_path.split("/").pop() || "unknown",
    };
  });
}

export function deleteArchivedSkill(
  name: string,
  projectPath?: string,
): boolean {
  if (projectPath) {
    const archiveDir = join(projectPath, ".claude", "archive", "skills", name);
    try {
      rmSync(archiveDir, { recursive: true });
      // Remove DB row
      const db = getDb();
      const srcPath = join(projectPath, ".claude", "skills", name, "SKILL.md");
      db.prepare("DELETE FROM instruction_files WHERE file_path = ?").run(
        srcPath,
      );
      return true;
    } catch (err) {
      skillLog.warn("operation failed", err);
      return false;
    }
  }

  const archiveDir = join(ARCHIVE_SKILLS_DIR, name);
  try {
    rmSync(archiveDir, { recursive: true });
    // Remove DB row for the original (pre-archive) path
    const db = getDb();
    const originalPath = join(SKILLS_DIR, name, "SKILL.md");
    db.prepare("DELETE FROM instruction_files WHERE file_path = ?").run(
      originalPath,
    );
    return true;
  } catch (err) {
    skillLog.warn("operation failed", err);
    return false;
  }
}
