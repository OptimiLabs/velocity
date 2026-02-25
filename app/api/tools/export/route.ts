import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { getProjectSkill, getSkill } from "@/lib/skills";
import { getCodexInstruction } from "@/lib/codex/skills";
import { getGeminiSkill } from "@/lib/gemini/skills";
import type { ConfigProvider } from "@/types/provider";

type SkillSelection =
  | string
  | {
      name: string;
      provider?: ConfigProvider;
      projectPath?: string;
      content?: string;
      description?: string;
    };

function isProvider(value: string | undefined): value is ConfigProvider {
  return value === "claude" || value === "codex" || value === "gemini";
}

function isSafeSegment(value: string): boolean {
  return !value.includes("/") && !value.includes("\\") && !value.includes("..");
}

function sanitizeSkillDirName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "skill"
  );
}

function withTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function hasFrontmatter(content: string): boolean {
  return /^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/.test(content);
}

function toSkillMarkdown(
  name: string,
  content: string,
  description?: string,
): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (hasFrontmatter(trimmed)) {
    return withTrailingNewline(trimmed);
  }
  const escapedDescription = description
    ? description.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    : undefined;
  const fm = [
    "---",
    `name: ${name}`,
    ...(escapedDescription ? [`description: "${escapedDescription}"`] : []),
    "---",
    "",
  ].join("\n");
  return `${fm}${trimmed}\n`;
}

function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (used.has(`${base}-${i}`)) i += 1;
  const candidate = `${base}-${i}`;
  used.add(candidate);
  return candidate;
}

function resolveSkill(selection: SkillSelection): {
  originalName: string;
  normalizedName: string;
  content: string;
  description?: string;
} | null {
  const raw =
    typeof selection === "string"
      ? { name: selection, provider: "claude" as ConfigProvider }
      : selection;
  const name = (raw.name || "").trim();
  if (!name) return null;

  const provider = isProvider(raw.provider) ? raw.provider : "claude";
  const projectPath = raw.projectPath?.trim() || undefined;

  if (provider === "codex") {
    let skill: ReturnType<typeof getCodexInstruction> | null = null;
    try {
      skill = getCodexInstruction(name, projectPath);
    } catch {
      skill = null;
    }
    const content = skill?.content || raw.content || "";
    if (!content.trim()) return null;
    return {
      originalName: name,
      normalizedName: sanitizeSkillDirName(skill?.name || name),
      content,
      description: skill?.description || raw.description,
    };
  }

  if (provider === "gemini") {
    let skill: ReturnType<typeof getGeminiSkill> | null = null;
    try {
      skill = getGeminiSkill(name, projectPath);
    } catch {
      skill = null;
    }
    const content = skill?.content || raw.content || "";
    if (!content.trim()) return null;
    return {
      originalName: name,
      normalizedName: sanitizeSkillDirName(skill?.name || name),
      content,
      description: raw.description,
    };
  }

  let skill: ReturnType<typeof getSkill> | null = null;
  try {
    skill = projectPath ? getProjectSkill(projectPath, name) : getSkill(name);
  } catch {
    skill = null;
  }
  const content = skill?.content || raw.content || "";
  if (!content.trim()) return null;

  return {
    originalName: name,
    normalizedName: sanitizeSkillDirName(skill?.name || name),
    content,
    description: skill?.description || raw.description,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { pluginName, skills, description } = (await request.json()) as {
      pluginName: string;
      skills: SkillSelection[];
      description?: string;
    };

    const trimmedPluginName = pluginName?.trim();
    if (!trimmedPluginName) {
      return NextResponse.json(
        { error: "Plugin name is required" },
        { status: 400 },
      );
    }
    if (!isSafeSegment(trimmedPluginName)) {
      return NextResponse.json(
        { error: "Plugin name must be a safe path segment" },
        { status: 400 },
      );
    }
    if (!skills?.length) {
      return NextResponse.json(
        { error: "At least one skill is required" },
        { status: 400 },
      );
    }

    const home = homedir();
    const pluginDir = join(home, ".claude", "plugins", trimmedPluginName);
    const skillsDir = join(pluginDir, "skills");

    // Create directories
    await mkdir(skillsDir, { recursive: true });

    const structure: string[] = [];
    const commandNames: string[] = [];
    const usedNames = new Set<string>();
    const skipped: string[] = [];

    // Copy each skill
    for (const selection of skills) {
      const resolved = resolveSkill(selection);
      if (!resolved) {
        skipped.push(
          typeof selection === "string" ? selection : (selection.name || "").trim(),
        );
        continue;
      }
      const exportName = uniqueName(resolved.normalizedName, usedNames);
      const skillMd = toSkillMarkdown(
        exportName,
        resolved.content,
        resolved.description,
      );
      if (!skillMd.trim()) {
        skipped.push(resolved.originalName);
        continue;
      }
      const skillDir = join(skillsDir, exportName);
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), skillMd, "utf-8");
      structure.push(`skills/${exportName}/SKILL.md`);
      commandNames.push(exportName);
    }

    if (commandNames.length === 0) {
      return NextResponse.json(
        {
          error:
            "None of the selected skills could be resolved. Refresh and try again.",
        },
        { status: 400 },
      );
    }

    // Generate README
    const readme = [
      `# ${trimmedPluginName}`,
      "",
      description || `A Claude Code plugin bundling custom skills.`,
      "",
      "## Skills",
      "",
      ...commandNames.map((s) => `- \`/${s}\``),
      "",
      "## Installation",
      "",
      "```bash",
      `claude plugin add ${trimmedPluginName}`,
      "```",
    ].join("\n");
    await writeFile(join(pluginDir, "README.md"), readme, "utf-8");
    structure.push("README.md");

    // Generate package.json
    const pkg = {
      name: trimmedPluginName,
      version: "1.0.0",
      description: description || `Claude Code plugin: ${trimmedPluginName}`,
      keywords: ["claude-code-plugin"],
    };
    await writeFile(
      join(pluginDir, "package.json"),
      JSON.stringify(pkg, null, 2) + "\n",
      "utf-8",
    );
    structure.push("package.json");

    return NextResponse.json({
      path: pluginDir,
      structure,
      exported: commandNames.length,
      skipped,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
