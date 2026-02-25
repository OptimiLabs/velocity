import { NextRequest, NextResponse } from "next/server";
import {
  getWorkflowAgent,
  upsertWorkflowAgent,
  deleteWorkflowAgent,
} from "@/lib/db/workflow-agents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  try {
    const { id, name } = await params;
    const agent = getWorkflowAgent(id, decodeURIComponent(name));
    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(agent);
  } catch (err) {
    console.error("Workflow agent get error:", err);
    return NextResponse.json(
      { error: "Failed to get workflow agent" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  try {
    const { id, name } = await params;
    const body = await req.json();
    const agent = upsertWorkflowAgent(id, {
      ...body,
      name: decodeURIComponent(name),
    });
    return NextResponse.json(agent);
  } catch (err) {
    console.error("Workflow agent update error:", err);
    return NextResponse.json(
      { error: "Failed to update workflow agent" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  try {
    const { id, name } = await params;
    const deleted = deleteWorkflowAgent(id, decodeURIComponent(name));
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Workflow agent delete error:", err);
    return NextResponse.json(
      { error: "Failed to delete workflow agent" },
      { status: 500 },
    );
  }
}
