import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { GEMINI_SKILLS_DIR, projectGeminiSkillsDir } from "./paths";

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
): GeminiSkill[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md") || f.endsWith(".md.disabled"));
  return files.map((f) => {
    const filePath = path.join(dir, f);
    const content = fs.readFileSync(filePath, "utf-8");
    const disabled = f.endsWith(".disabled");
    return {
      name: f.replace(/\.md(\.disabled)?$/, ""),
      content,
      provider: "gemini" as const,
      origin: "user" as const,
      visibility: meta.visibility,
      archived: false as const,
      filePath,
      projectPath: meta.projectPath,
      projectName: meta.projectName,
      disabled,
    };
  });
}

export function listGeminiSkills(
  projectPaths?: Array<{ path: string; name?: string }> | string[],
): GeminiSkill[] {
  const out = listSkillsInDir(GEMINI_SKILLS_DIR, { visibility: "global" });
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
    out.push(
      ...listSkillsInDir(projectGeminiSkillsDir(projectPath), {
        visibility: "project",
        projectPath,
        projectName,
      }),
    );
  }
  return out;
}

function resolveSkillPath(name: string, projectPath?: string): string {
  const safe = sanitizeSkillName(name);
  const dir = projectPath ? projectGeminiSkillsDir(projectPath) : GEMINI_SKILLS_DIR;
  return path.join(dir, `${safe}.md`);
}

function resolveDisabledSkillPath(name: string, projectPath?: string): string {
  return `${resolveSkillPath(name, projectPath)}.disabled`;
}

export function getGeminiSkill(
  name: string,
  projectPath?: string,
): GeminiSkill | null {
  const filePath = resolveSkillPath(name, projectPath);
  const disabledPath = resolveDisabledSkillPath(name, projectPath);
  const foundPath = fs.existsSync(filePath)
    ? filePath
    : fs.existsSync(disabledPath)
      ? disabledPath
      : null;
  if (!foundPath) return null;
  return {
    name: sanitizeSkillName(name),
    content: fs.readFileSync(foundPath, "utf-8"),
    provider: "gemini",
    origin: "user",
    visibility: projectPath ? "project" : "global",
    archived: false,
    filePath: foundPath,
    projectPath,
    projectName: projectPath ? path.basename(projectPath) : undefined,
    disabled: foundPath.endsWith(".disabled"),
  };
}

export function saveGeminiSkill(
  name: string,
  content: string,
  projectPath?: string,
): string {
  const filePath = resolveSkillPath(name, projectPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  const disabledPath = `${filePath}.disabled`;
  if (fs.existsSync(disabledPath)) {
    fs.unlinkSync(disabledPath);
  }
  return filePath;
}

export function deleteGeminiSkill(name: string, projectPath?: string): boolean {
  const filePath = resolveSkillPath(name, projectPath);
  const disabledPath = `${filePath}.disabled`;
  let deleted = false;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    deleted = true;
  }
  if (fs.existsSync(disabledPath)) {
    fs.unlinkSync(disabledPath);
    deleted = true;
  }
  return deleted;
}

export function setGeminiSkillDisabled(
  name: string,
  disabled: boolean,
  projectPath?: string,
): boolean {
  const filePath = resolveSkillPath(name, projectPath);
  const disabledPath = `${filePath}.disabled`;
  const from = disabled ? filePath : disabledPath;
  const to = disabled ? disabledPath : filePath;
  if (!fs.existsSync(from)) return false;
  fs.renameSync(from, to);
  return true;
}
