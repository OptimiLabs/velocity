import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseJsonlPage } from "@/lib/parser/jsonl";
import { pairToolCallsWithResults } from "@/lib/parser/pair-tool-calls";
import { jsonWithCache } from "@/lib/api/cache-headers";
import type { Session } from "@/types/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | Session
    | undefined;

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(
        parseInt(url.searchParams.get("limit") || "200", 10) || 200,
        1,
      ),
      500,
    );

    // First pass: we need total to compute default page (last page).
    // parseJsonlPage streams the file — only the requested page is kept in memory.
    // If no page param, we need a count-only pass first for the default-to-last-page behavior.
    const rawPage = url.searchParams.get("page");

    // page=-1 tells parseJsonlPage to return the last page in a single pass
    const requestedPage = rawPage
      ? Math.max(parseInt(rawPage, 10) || 1, 1)
      : -1;

    const result = await parseJsonlPage(
      session.jsonl_path,
      requestedPage,
      limit,
    );
    let { messages, page } = result;
    const { total } = result;

    // Clamp if caller requested a page beyond the end
    if (rawPage) {
      const totalPages = Math.max(1, Math.ceil(total / limit));
      if (page > totalPages) {
        const clamped = await parseJsonlPage(
          session.jsonl_path,
          totalPages,
          limit,
        );
        messages = clamped.messages;
        page = totalPages;
      }
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Pair tool_use blocks with their corresponding tool_result blocks
    pairToolCallsWithResults(messages);

    return jsonWithCache(
      {
        messages,
        total,
        page,
        pageSize: limit,
        totalPages,
        hasMore: page > 1,
      },
      "detail",
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to read session file" },
      { status: 500 },
    );
  }
}
