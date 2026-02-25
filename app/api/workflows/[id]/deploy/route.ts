import { NextRequest, NextResponse } from "next/server";
import { getWorkflow, updateWorkflow } from "@/lib/db/workflows";
import { slugify, buildCommandPrompt } from "@/lib/workflows/command-prompt";
import { syncWorkflowCommandArtifact } from "@/lib/workflows/command-artifact-sync";
import { getSkill, getProjectSkill } from "@/lib/skills";
import { getCodexInstruction } from "@/lib/codex/skills";
import { getGeminiSkill } from "@/lib/gemini/skills";
import type { ConfigProvider } from "@/types/provider";

/** GET: Preview the command prompt without deploying */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workflow = getWorkflow(id);
    if (!workflow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const commandName =
      slugify(workflow.commandName || workflow.name) || "workflow";
    const prompt = buildCommandPrompt(workflow);
    const description =
      workflow.commandDescription?.trim() ||
      workflow.generatedPlan ||
      `Run the "${workflow.name}" workflow`;

    return NextResponse.json({
      commandName,
      description,
      prompt,
      nodeCount: workflow.nodes.length,
    });
  } catch (err) {
    console.error("Deploy preview error:", err);
    return NextResponse.json({ error: "Failed to preview" }, { status: 500 });
  }
}

function deploymentMessage(
  provider: ConfigProvider,
  commandName: string,
): string {
  if (provider === "codex") {
    return `Deployed as skill "${commandName}" (use /skills or $${commandName})`;
  }
  if (provider === "gemini") {
    return `Deployed as Gemini skill "${commandName}"`;
  }
  return `Deployed as /${commandName}`;
}

function checkCommandNameConflict(input: {
  provider: ConfigProvider;
  commandName: string;
  projectPath?: string;
}): { conflicted: false } | { conflicted: true; reason: string } {
  const { provider, commandName, projectPath } = input;

  if (provider === "codex") {
    const existing = getCodexInstruction(commandName, projectPath);
    if (existing) {
      return {
        conflicted: true,
        reason: `Skill "${commandName}" already exists for Codex.`,
      };
    }
    return { conflicted: false };
  }

  if (provider === "gemini") {
    const existing = getGeminiSkill(commandName, projectPath);
    if (existing) {
      return {
        conflicted: true,
        reason: `Skill "${commandName}" already exists for Gemini.`,
      };
    }
    return { conflicted: false };
  }

  const existing = projectPath
    ? getProjectSkill(projectPath, commandName)
    : getSkill(commandName);
  if (existing) {
    return {
      conflicted: true,
      reason: `Slash command "/${commandName}" already exists.`,
    };
  }

  return { conflicted: false };
}

/** POST: Deploy workflow as a provider-native skill command */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workflow = getWorkflow(id);
    if (!workflow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (workflow.nodes.length === 0) {
      return NextResponse.json(
        { error: "Workflow has no steps to deploy" },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as
      | {
          commandName?: unknown;
          description?: unknown;
          prompt?: unknown;
          force?: unknown;
        }
      | null;
    const requestedCommandName =
      typeof body?.commandName === "string" ? body.commandName.trim() : "";
    const requestedDescription =
      typeof body?.description === "string" ? body.description.trim() : "";
    const requestedPrompt =
      typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const force =
      body?.force === true ||
      body?.force === "true" ||
      body?.force === 1 ||
      body?.force === "1";

    const commandName =
      slugify(requestedCommandName || workflow.commandName || workflow.name) ||
      "workflow";
    const description =
      requestedDescription ||
      workflow.commandDescription?.trim() ||
      workflow.generatedPlan ||
      `Run the "${workflow.name}" workflow`;
    const prompt = requestedPrompt || buildCommandPrompt(workflow);
    const provider = workflow.provider ?? "claude";

    if (!force) {
      const conflict = checkCommandNameConflict({
        provider,
        commandName,
        projectPath: workflow.projectPath,
      });
      if (conflict.conflicted) {
        return NextResponse.json(
          {
            error: `${conflict.reason} Choose another name or confirm overwrite.`,
            code: "DEPLOY_NAME_CONFLICT",
            commandName,
            canForce: true,
          },
          { status: 409 },
        );
      }
    }

    // Save commandName to DB FIRST (critical)
    const updated = updateWorkflow(id, {
      commandName,
      commandDescription: description,
      autoSkillEnabled: true,
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Then sync skill file (non-fatal — skill can be re-synced later)
    try {
      syncWorkflowCommandArtifact({
        provider: updated.provider,
        commandName,
        commandDescription: description,
        prompt,
        projectPath: updated.projectPath,
      });
    } catch (skillErr) {
      console.error("Skill file sync failed (non-fatal):", skillErr);
    }

    return NextResponse.json({
      success: true,
      commandName,
      message: deploymentMessage(updated.provider ?? "claude", commandName),
    });
  } catch (err) {
    console.error("Deploy error:", err);
    return NextResponse.json({ error: "Failed to deploy" }, { status: 500 });
  }
}
