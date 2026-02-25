import { NextRequest, NextResponse } from "next/server";
import {
  listAllSkills,
  saveSkill,
  saveProjectSkill,
} from "@/lib/skills";
import {
  normalizeProjectPath,
  normalizeSkillName,
  validateNormalizedSkillName,
} from "@/lib/skills-validation";
import { listWorkflows } from "@/lib/db/workflows";
import {
  listCodexInstructions,
  saveCodexInstruction,
} from "@/lib/codex/skills";
import { listGeminiSkills, saveGeminiSkill } from "@/lib/gemini/skills";
import { apiLog } from "@/lib/logger";
import type { ConfigProvider } from "@/types/provider";
import type { SkillCategory } from "@/lib/skills-shared";

const VALID_CATEGORIES = new Set<SkillCategory>([
  "domain-expertise",
  "workflow-automation",
  "mcp-enhancement",
]);

function searchParamsOf(request: NextRequest): URLSearchParams {
  if ("nextUrl" in request && request.nextUrl) return request.nextUrl.searchParams;
  return new URL(request.url).searchParams;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = searchParamsOf(request);
    const provider = (searchParams.get("provider") || "claude") as ConfigProvider;

    if (provider === "codex") {
      const instructions = listCodexInstructions();
      // Map to match the existing skill response shape
      const mapped = instructions.map((inst) => ({
        name: inst.name,
        description: inst.description,
        content: inst.content,
        visibility: inst.visibility,
        origin: inst.origin,
        archived: inst.archived,
        provider: inst.provider,
        filePath: inst.filePath,
        projectPath: inst.projectPath,
        projectName: inst.projectName,
        disabled: inst.disabled,
      }));
      return NextResponse.json(mapped);
    }

    if (provider === "gemini") {
      const skills = listGeminiSkills();
      const mapped = skills.map((skill) => ({
        name: skill.name,
        description: undefined,
        content: skill.content,
        visibility: skill.visibility,
        origin: skill.origin,
        archived: skill.archived,
        provider: skill.provider,
        filePath: skill.filePath,
        projectPath: skill.projectPath,
        projectName: skill.projectName,
        disabled: skill.disabled,
      }));
      return NextResponse.json(mapped);
    }

    // Default: claude
    const skills = listAllSkills();

    // Cross-reference skills with workflows to find workflow origins
    const workflows = listWorkflows();
    const skillWorkflowMap = new Map<string, { id: string; name: string }>();
    for (const wf of workflows) {
      if (wf.autoSkillEnabled && wf.commandName) {
        skillWorkflowMap.set(wf.commandName, { id: wf.id, name: wf.name });
      }
    }

    const annotated = skills.map((skill) => {
      const wfOrigin = skillWorkflowMap.get(skill.name);
      return wfOrigin ? { ...skill, workflow: wfOrigin } : skill;
    });

    return NextResponse.json(annotated);
  } catch (e) {
    apiLog.error("GET /api/skills failed", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const searchParams = searchParamsOf(request);
    const body = (await request.json()) as {
      name: string;
      description?: string;
      content: string;
      projectPath?: string;
      category?: string;
      provider?: ConfigProvider;
    };
    const { name, description, content, projectPath, category } = body;
    const provider = (body.provider ||
      searchParams.get("provider") ||
      "claude") as ConfigProvider;
    if (provider !== "claude" && provider !== "codex" && provider !== "gemini") {
      return NextResponse.json(
        { error: "Invalid provider", code: "INVALID_PROVIDER" },
        { status: 400 },
      );
    }

    const rawName = (name || "").trim();
    if (
      rawName.includes("/") ||
      rawName.includes("\\") ||
      rawName.includes("..")
    ) {
      return NextResponse.json(
        {
          error: "Skill name must not contain path separators or '..'",
          code: "INVALID_SKILL_NAME",
        },
        { status: 400 },
      );
    }

    const normalizedName = normalizeSkillName(rawName);
    const nameValidation = validateNormalizedSkillName(normalizedName);
    if (!nameValidation.ok) {
      return NextResponse.json(
        { error: nameValidation.error, code: nameValidation.code },
        { status: 400 },
      );
    }
    if (!content?.trim()) {
      return NextResponse.json(
        { error: "Content is required", code: "EMPTY_CONTENT" },
        { status: 400 },
      );
    }

    let normalizedProjectPath: string | undefined;
    if (projectPath?.trim()) {
      try {
        normalizedProjectPath = normalizeProjectPath(projectPath);
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error ? error.message : "Invalid project path",
            code: "INVALID_PROJECT_PATH",
          },
          { status: 400 },
        );
      }
    }

    let validCategory: import("@/lib/skills").SkillCategory | undefined;
    if (category != null) {
      if (!VALID_CATEGORIES.has(category as SkillCategory)) {
        return NextResponse.json(
          { error: "Invalid category", code: "INVALID_CATEGORY" },
          { status: 400 },
        );
      }
      validCategory = category as import("@/lib/skills").SkillCategory;
    }

    if (provider === "codex") {
      saveCodexInstruction(
        normalizedName,
        content,
        normalizedProjectPath,
        description?.trim(),
      );
      return NextResponse.json({ success: true, name: normalizedName });
    }
    if (provider === "gemini") {
      saveGeminiSkill(normalizedName, content, normalizedProjectPath);
      return NextResponse.json({ success: true, name: normalizedName });
    }

    if (normalizedProjectPath) {
      saveProjectSkill(
        normalizedProjectPath,
        normalizedName,
        description?.trim(),
        content,
        validCategory,
      );
    } else {
      saveSkill(normalizedName, description?.trim(), content, validCategory);
    }
    return NextResponse.json({ success: true, name: normalizedName });
  } catch (e) {
    apiLog.error("POST /api/skills failed", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
