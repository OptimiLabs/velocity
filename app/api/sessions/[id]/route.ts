import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { jsonWithCache } from "@/lib/api/cache-headers";
import type { Session } from "@/types/session";
import fs from "fs";

export async function GET(
  _request: Request,
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
  const normalizedSession: Session =
    session.session_role === "subagent"
      ? session
      : { ...session, session_role: "standalone" };

  // Build parent/children relationships
  let children: {
    id: string;
    subagent_type: string | null;
    total_cost: number;
    created_at: string;
    summary: string | null;
    first_prompt: string | null;
  }[] = [];
  let parent: {
    id: string;
    summary: string | null;
    first_prompt: string | null;
  } | null = null;

  if (normalizedSession.session_role !== "subagent") {
    children = db
      .prepare(
        "SELECT id, subagent_type, total_cost, created_at, summary, first_prompt FROM sessions WHERE parent_session_id = ? ORDER BY created_at",
      )
      .all(id) as typeof children;
  }

  if (
    normalizedSession.session_role === "subagent" &&
    normalizedSession.parent_session_id
  ) {
    parent =
      (db
        .prepare("SELECT id, summary, first_prompt FROM sessions WHERE id = ?")
        .get(normalizedSession.parent_session_id) as typeof parent) ?? null;
  }

  return jsonWithCache({ ...normalizedSession, children, parent }, "detail");
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const existing = db
    .prepare("SELECT id, jsonl_path FROM sessions WHERE id = ?")
    .get(id) as { id: string; jsonl_path: string } | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let fileDeleted = false;
  if (existing.jsonl_path && fs.existsSync(existing.jsonl_path)) {
    try {
      fs.unlinkSync(existing.jsonl_path);
      fileDeleted = true;
    } catch {
      // keep DB delete best-effort even if file delete fails
    }
  }

  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return NextResponse.json({ success: true, fileDeleted });
}
