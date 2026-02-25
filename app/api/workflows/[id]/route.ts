import { NextRequest, NextResponse } from "next/server";
import {
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
} from "@/lib/db/workflows";
import { buildCommandPrompt } from "@/lib/workflows/command-prompt";
import { cleanupWorkflowSkill } from "@/lib/workflows/cleanup";
import { cleanupWorkflowCommandArtifact, syncWorkflowCommandArtifact } from "@/lib/workflows/command-artifact-sync";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const wf = getWorkflow(id);
    if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(wf);
  } catch (err) {
    console.error("Workflow get error:", err);
    return NextResponse.json(
      { error: "Failed to get workflow" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Read the old workflow to detect commandName changes
    const oldWorkflow = getWorkflow(id, { includeAgents: false });
    const oldCommandName = oldWorkflow?.commandName ?? null;

    const updated = updateWorkflow(id, body);
    if (!updated)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Auto-sync skill file if enabled
    try {
      if (updated.autoSkillEnabled && updated.commandName) {
        const prompt = buildCommandPrompt(updated);
        syncWorkflowCommandArtifact({
          provider: updated.provider,
          commandName: updated.commandName,
          commandDescription: updated.commandDescription ?? undefined,
          prompt,
          projectPath: updated.projectPath,
        });

        // If command name changed, clean up old skill file + old route
        if (oldCommandName && oldCommandName !== updated.commandName) {
          cleanupWorkflowCommandArtifact({
            provider: oldWorkflow?.provider,
            commandName: oldCommandName,
            projectPath: oldWorkflow?.projectPath ?? null,
          });
        }
      }
    } catch (skillErr) {
      console.error("Skill auto-sync failed (non-fatal):", skillErr);
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Workflow update error:", err);
    return NextResponse.json(
      { error: "Failed to update workflow" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (body.action === "duplicate") {
      const copy = duplicateWorkflow(id);
      if (!copy)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(copy);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("Workflow action error:", err);
    return NextResponse.json(
      { error: "Failed to process action" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Clean up skill file + CLAUDE.md route before deleting workflow
    try {
      const workflow = getWorkflow(id, { includeAgents: false });
      if (workflow) cleanupWorkflowSkill(workflow);
    } catch (skillErr) {
      console.error("Skill cleanup failed (non-fatal):", skillErr);
    }

    const deleted = deleteWorkflow(id);
    if (!deleted)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Workflow delete error:", err);
    return NextResponse.json(
      { error: "Failed to delete workflow" },
      { status: 500 },
    );
  }
}
