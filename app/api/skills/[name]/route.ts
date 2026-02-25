import { NextRequest, NextResponse } from "next/server";
import {
  getSkill,
  saveSkill,
  deleteSkill,
  getProjectSkill,
  saveProjectSkill,
  deleteProjectSkill,
  setSkillDisabled,
  setProjectSkillDisabled,
} from "@/lib/skills";
import {
  getCodexInstruction,
  saveCodexInstruction,
  deleteCodexInstruction,
  setCodexInstructionDisabled,
} from "@/lib/codex/skills";
import {
  getGeminiSkill,
  saveGeminiSkill,
  deleteGeminiSkill,
  setGeminiSkillDisabled,
} from "@/lib/gemini/skills";
import {
  assertSafeSkillPathSegment,
  normalizeProjectPath,
} from "@/lib/skills-validation";
import type { SkillCategory } from "@/lib/skills-shared";
import type { ConfigProvider } from "@/types/provider";

const VALID_CATEGORIES = new Set<SkillCategory>([
  "domain-expertise",
  "workflow-automation",
  "mcp-enhancement",
]);

function searchParamsOf(request: NextRequest): URLSearchParams {
  if ("nextUrl" in request && request.nextUrl) return request.nextUrl.searchParams;
  return new URL(request.url).searchParams;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const searchParams = searchParamsOf(request);
  const projectPath = searchParams.get("projectPath");
  const provider = (searchParams.get("provider") ||
    "claude") as ConfigProvider;

  const skill =
    provider === "codex"
      ? getCodexInstruction(name, projectPath || undefined)
      : provider === "gemini"
        ? getGeminiSkill(name, projectPath || undefined)
        : projectPath
          ? getProjectSkill(projectPath, name)
          : getSkill(name);
  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
  return NextResponse.json(skill);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  try {
    const searchParams = searchParamsOf(request);
    const provider = (searchParams.get("provider") ||
      "claude") as ConfigProvider;
    let safeName: string;
    try {
      safeName = assertSafeSkillPathSegment(name);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Invalid skill name",
          code: "INVALID_SKILL_NAME",
        },
        { status: 400 },
      );
    }

    const { description, content, projectPath, category } = (await request.json()) as {
      description?: string;
      content: string;
      projectPath?: string;
      category?: string;
    };

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

    if (normalizedProjectPath) {
      if (provider === "codex") {
        saveCodexInstruction(
          safeName,
          content,
          normalizedProjectPath,
          description?.trim(),
        );
        return NextResponse.json({ success: true });
      }
      if (provider === "gemini") {
        saveGeminiSkill(safeName, content, normalizedProjectPath);
        return NextResponse.json({ success: true });
      }
      saveProjectSkill(
        normalizedProjectPath,
        safeName,
        description?.trim(),
        content,
        validCategory,
      );
    } else {
      if (provider === "codex") {
        saveCodexInstruction(safeName, content, undefined, description?.trim());
        return NextResponse.json({ success: true });
      }
      if (provider === "gemini") {
        saveGeminiSkill(safeName, content);
        return NextResponse.json({ success: true });
      }
      saveSkill(safeName, description?.trim(), content, validCategory);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  try {
    const searchParams = searchParamsOf(request);
    const provider = (searchParams.get("provider") ||
      "claude") as ConfigProvider;
    let safeName: string;
    try {
      safeName = assertSafeSkillPathSegment(name);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Invalid skill name",
          code: "INVALID_SKILL_NAME",
        },
        { status: 400 },
      );
    }

    const { disabled, projectPath } = (await request.json()) as {
      disabled: boolean;
      projectPath?: string;
    };

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

    const ok = normalizedProjectPath
      ? provider === "codex"
        ? setCodexInstructionDisabled(safeName, disabled, normalizedProjectPath)
        : provider === "gemini"
          ? setGeminiSkillDisabled(safeName, disabled, normalizedProjectPath)
          : setProjectSkillDisabled(normalizedProjectPath, safeName, disabled)
      : provider === "codex"
        ? setCodexInstructionDisabled(safeName, disabled)
        : provider === "gemini"
          ? setGeminiSkillDisabled(safeName, disabled)
          : setSkillDisabled(safeName, disabled);

    if (!ok) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const searchParams = searchParamsOf(request);
  const provider = (searchParams.get("provider") ||
    "claude") as ConfigProvider;
  let safeName: string;
  try {
    safeName = assertSafeSkillPathSegment(name);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid skill name",
        code: "INVALID_SKILL_NAME",
      },
      { status: 400 },
    );
  }
  const projectPath = searchParams.get("projectPath");
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

  const deleted = normalizedProjectPath
    ? provider === "codex"
      ? deleteCodexInstruction(safeName, normalizedProjectPath)
      : provider === "gemini"
        ? deleteGeminiSkill(safeName, normalizedProjectPath)
        : deleteProjectSkill(normalizedProjectPath, safeName)
    : provider === "codex"
      ? deleteCodexInstruction(safeName)
      : provider === "gemini"
        ? deleteGeminiSkill(safeName)
        : deleteSkill(safeName);
  if (!deleted) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
