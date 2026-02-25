import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { ensureProjectRecord } from "@/lib/projects/registry";
import {
  CODEX_SKILLS_DIR,
  projectCodexSkillsDir,
} from "./paths";

export interface CodexInstruction {
  name: string;
  description?: string;
  content: string;
  provider: "codex";
  origin: "user";
  visibility: "global" | "project";
  archived: false;
  filePath: string;
  projectPath?: string;
  projectName?: string;
  disabled?: boolean;
}

interface InstructionPathCandidate {
  activePath: string;
  disabledPath: string;
  format: "package" | "flat";
  rootDir: string;
}

function extractFrontmatterDescription(content: string): string | undefined {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!frontmatterMatch) return undefined;
  const descriptionMatch = frontmatterMatch[1].match(
    /^\s*description\s*:\s*(.+?)\s*$/m,
  );
  if (!descriptionMatch) return undefined;
  const raw = descriptionMatch[1].trim();
  return raw.replace(/^['"]|['"]$/g, "").trim() || undefined;
}

function listInstructionsInDir(
  dir: string,
  meta: {
    visibility: "global" | "project";
    projectPath?: string;
    projectName?: string;
  },
): CodexInstruction[] {
  if (!fs.existsSync(dir)) return [];

  const out: CodexInstruction[] = [];

  const pushInstruction = (name: string, filePath: string) => {
    const content = fs.readFileSync(filePath, "utf-8");
    out.push({
      name,
      description: extractFrontmatterDescription(content),
      content,
      provider: "codex",
      origin: "user",
      visibility: meta.visibility,
      archived: false,
      filePath,
      projectPath: meta.projectPath,
      projectName: meta.projectName,
      disabled: filePath.endsWith(".disabled"),
    });
  };

  try {
    const topLevel = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of topLevel) {
      if (!entry.isFile()) continue;
      const fileName = entry.name;
      if (!fileName.endsWith(".md") && !fileName.endsWith(".md.disabled")) {
        continue;
      }
      const filePath = path.join(dir, fileName);
      pushInstruction(fileName.replace(/\.md(\.disabled)?$/, ""), filePath);
    }

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
          pushInstruction(entry.name, skillPath);
        } else if (fs.existsSync(disabledSkillPath)) {
          pushInstruction(entry.name, disabledSkillPath);
        }

        walkSkillDirs(entryPath);
      }
    };

    walkSkillDirs(dir);
  } catch {
    return [];
  }

  return out;
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

export function getCodexInstructionDirs(projectPath?: string): string[] {
  if (projectPath) {
    return [projectCodexSkillsDir(projectPath)];
  }
  return [CODEX_SKILLS_DIR];
}

function sanitizeInstructionName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

function buildPackageCandidate(
  rootDir: string,
  safeName: string,
): InstructionPathCandidate {
  const activePath = path.join(rootDir, safeName, "SKILL.md");
  return {
    activePath,
    disabledPath: `${activePath}.disabled`,
    format: "package",
    rootDir,
  };
}

function buildFlatCandidate(
  rootDir: string,
  safeName: string,
): InstructionPathCandidate {
  const activePath = path.join(rootDir, `${safeName}.md`);
  return {
    activePath,
    disabledPath: `${activePath}.disabled`,
    format: "flat",
    rootDir,
  };
}

function getInstructionPathCandidates(
  name: string,
  projectPath?: string,
): InstructionPathCandidate[] {
  const safe = sanitizeInstructionName(name);
  const candidates: InstructionPathCandidate[] = [];

  for (const dir of getCodexInstructionDirs(projectPath)) {
    const isSkillsDir = path.basename(dir) === "skills";
    if (isSkillsDir) {
      candidates.push(buildPackageCandidate(dir, safe));
      candidates.push(buildFlatCandidate(dir, safe));
    } else {
      candidates.push(buildFlatCandidate(dir, safe));
      candidates.push(buildPackageCandidate(dir, safe));
    }
  }

  return candidates;
}

function pruneEmptySkillDir(candidate: InstructionPathCandidate): void {
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
    (description || `Custom Codex skill "${safeName}"`).replace(/"/g, '\\"');

  return `---\nname: ${safeName}\ndescription: "${safeDescription}"\n---\n\n${body}\n`;
}

export function listCodexInstructions(
  projectPaths?: Array<{ path: string; name?: string }> | string[],
): CodexInstruction[] {
  try {
    const out: CodexInstruction[] = [];
    const seen = new Set<string>();

    const appendUnique = (items: CodexInstruction[]) => {
      for (const item of items) {
        const key = `${item.visibility}:${item.projectPath || ""}:${item.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    };

    for (const dir of getCodexInstructionDirs()) {
      appendUnique(
        listInstructionsInDir(dir, {
          visibility: "global",
        }),
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
      for (const dir of getCodexInstructionDirs(projectPath)) {
        appendUnique(
          listInstructionsInDir(dir, {
            visibility: "project",
            projectPath,
            projectName,
          }),
        );
      }
    }

    return out;
  } catch {
    return [];
  }
}

export function getCodexInstruction(
  name: string,
  projectPath?: string,
): CodexInstruction | null {
  const candidates = getInstructionPathCandidates(name, projectPath);
  let foundPath: string | null = null;

  for (const candidate of candidates) {
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

  const safe = sanitizeInstructionName(name);
  return {
    name: safe,
    content: fs.readFileSync(foundPath, "utf-8"),
    provider: "codex",
    origin: "user",
    visibility: projectPath ? "project" : "global",
    archived: false,
    filePath: foundPath,
    projectPath,
    projectName: projectPath ? path.basename(projectPath) : undefined,
    disabled: foundPath.endsWith(".disabled"),
  };
}

export function saveCodexInstruction(
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

  const [canonical] = getInstructionPathCandidates(
    name,
    projectPath,
  );
  const filePath = canonical.activePath;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const safeName = sanitizeInstructionName(name);
  fs.writeFileSync(
    filePath,
    ensureSkillFrontmatter(safeName, content, description),
    "utf-8",
  );

  if (fs.existsSync(canonical.disabledPath)) {
    fs.unlinkSync(canonical.disabledPath);
  }

  return filePath;
}

export function deleteCodexInstruction(name: string, projectPath?: string): boolean {
  let deleted = false;
  for (const candidate of getInstructionPathCandidates(name, projectPath)) {
    if (fs.existsSync(candidate.activePath)) {
      fs.unlinkSync(candidate.activePath);
      deleted = true;
    }
    if (fs.existsSync(candidate.disabledPath)) {
      fs.unlinkSync(candidate.disabledPath);
      deleted = true;
    }
    pruneEmptySkillDir(candidate);
  }
  return deleted;
}

export function setCodexInstructionDisabled(
  name: string,
  disabled: boolean,
  projectPath?: string,
): boolean {
  for (const candidate of getInstructionPathCandidates(name, projectPath)) {
    const from = disabled ? candidate.activePath : candidate.disabledPath;
    const to = disabled ? candidate.disabledPath : candidate.activePath;
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    return true;
  }
  return false;
}
