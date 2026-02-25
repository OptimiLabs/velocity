import { NextRequest, NextResponse } from "next/server";
import { ensureIndexed } from "@/lib/db";
import {
  listAnalysisConversations,
  createAnalysisConversation,
} from "@/lib/db/analysis-conversations";

export async function GET(req: NextRequest) {
  try {
    await ensureIndexed();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as
      | "active"
      | "archived"
      | null;
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const result = listAnalysisConversations({
      status: status || undefined,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list conversations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureIndexed();
    const body = await req.json();
    const { title, sessionIds, enabledSessionIds, scope, model, messages } =
      body;

    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return NextResponse.json(
        { error: "sessionIds is required" },
        { status: 400 },
      );
    }

    const conversation = createAnalysisConversation({
      title: title || "",
      sessionIds,
      enabledSessionIds: enabledSessionIds || sessionIds,
      scope,
      model,
      messages,
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create conversation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
