import { NextRequest, NextResponse } from "next/server";
import {
  listWorkflows,
  createWorkflow,
  getWorkflow,
  deleteWorkflow,
} from "@/lib/db/workflows";
import { cleanupWorkflowSkill } from "@/lib/workflows/cleanup";
import { apiLog } from "@/lib/logger";
import type { ConfigProvider } from "@/types/provider";

export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get("scope") as
      | "all"
      | "global"
      | "project"
      | null;
    const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
    const workflows = listWorkflows({
      scope: scope || "all",
      projectId,
    });
    return NextResponse.json(workflows);
  } catch (err) {
    apiLog.error("GET /api/workflows failed", err);
    return NextResponse.json(
      { error: "Failed to list workflows" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required" },
        { status: 400 },
      );
    }

    let deleted = 0;
    for (const id of ids) {
      const workflow = getWorkflow(id, { includeAgents: false });
      if (!workflow) continue;
      if (!deleteWorkflow(id)) continue;
      deleted++;

      // Best-effort cleanup of generated artifacts and attachment links.
      try {
        cleanupWorkflowSkill(workflow);
      } catch (skillErr) {
        apiLog.error(`Workflow cleanup failed for ${id} (non-fatal)`, skillErr);
      }
    }

    return NextResponse.json({ deleted });
  } catch (err) {
    apiLog.error("DELETE /api/workflows failed", err);
    return NextResponse.json(
      { error: "Failed to delete workflows" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      provider,
      name,
      description,
      cwd,
      nodes,
      edges,
      generatedPlan,
      projectId,
      projectPath,
    } = body;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const workflow = createWorkflow({
      provider:
        provider === "claude" || provider === "codex" || provider === "gemini"
          ? (provider as ConfigProvider)
          : undefined,
      name,
      description: description ?? "",
      cwd: cwd ?? "",
      nodes: nodes ?? [],
      edges: edges ?? [],
      generatedPlan: generatedPlan ?? "",
      projectId: projectId ?? undefined,
      projectPath: projectPath ?? undefined,
    });

    return NextResponse.json(workflow);
  } catch (err) {
    apiLog.error("POST /api/workflows failed", err);
    return NextResponse.json(
      { error: "Failed to create workflow" },
      { status: 500 },
    );
  }
}
