import { NextRequest, NextResponse } from "next/server";
import { getWorkflow, updateWorkflow } from "@/lib/db/workflows";
import { slugify, buildCommandPrompt } from "@/lib/workflows/command-prompt";
import { syncWorkflowCommandArtifact } from "@/lib/workflows/command-artifact-sync";

/** GET: Preview the command prompt without deploying */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workflow = getWorkflow(id, { includeAgents: false });
    if (!workflow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const commandName = slugify(workflow.name) || "workflow";
    const prompt = buildCommandPrompt(workflow);

    return NextResponse.json({
      commandName,
      description:
        workflow.generatedPlan || `Run the "${workflow.name}" workflow`,
      prompt,
      nodeCount: workflow.nodes.length,
    });
  } catch (err) {
    console.error("Deploy preview error:", err);
    return NextResponse.json({ error: "Failed to preview" }, { status: 500 });
  }
}

/** POST: Deploy workflow as a /command */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workflow = getWorkflow(id, { includeAgents: false });
    if (!workflow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (workflow.nodes.length === 0) {
      return NextResponse.json(
        { error: "Workflow has no steps to deploy" },
        { status: 400 },
      );
    }

    const commandName = slugify(workflow.name) || "workflow";
    const description =
      workflow.generatedPlan || `Run the "${workflow.name}" workflow`;
    const prompt = buildCommandPrompt(workflow);

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
      message: `Deployed as /${commandName}`,
    });
  } catch (err) {
    console.error("Deploy error:", err);
    return NextResponse.json({ error: "Failed to deploy" }, { status: 500 });
  }
}
