import { NextRequest, NextResponse } from "next/server";
import { ensureIndexed } from "@/lib/db";
import {
  getAnalysisConversation,
  updateAnalysisConversation,
  deleteAnalysisConversation,
} from "@/lib/db/analysis-conversations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureIndexed();
    const { id } = await params;
    const conversation = getAnalysisConversation(id);
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(conversation);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureIndexed();
    const { id } = await params;
    const body = await req.json();

    const updated = updateAnalysisConversation(id, body);
    if (!updated) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(updated);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureIndexed();
    const { id } = await params;
    const deleted = deleteAnalysisConversation(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
