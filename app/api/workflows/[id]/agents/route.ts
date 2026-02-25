import { NextRequest, NextResponse } from "next/server";
import {
  listWorkflowAgents,
  upsertWorkflowAgent,
} from "@/lib/db/workflow-agents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const agents = listWorkflowAgents(id);
    return NextResponse.json(agents);
  } catch (err) {
    console.error("Workflow agents list error:", err);
    return NextResponse.json(
      { error: "Failed to list workflow agents" },
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
    if (!body.name) {
      return NextResponse.json(
        { error: "Agent name is required" },
        { status: 400 },
      );
    }
    const agent = upsertWorkflowAgent(id, body);
    return NextResponse.json(agent);
  } catch (err) {
    console.error("Workflow agent upsert error:", err);
    return NextResponse.json(
      { error: "Failed to create workflow agent" },
      { status: 500 },
    );
  }
}
