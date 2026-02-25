import { NextResponse } from "next/server";
import {
  listConsoleSessions,
  listArchivedConsoleSessions,
  listAllConsoleSessions,
  updateConsoleSessionActivity,
} from "@/lib/db/console-sessions";
import { apiLog } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") ?? "active";

    let sessions;
    switch (filter) {
      case "archived":
        sessions = listArchivedConsoleSessions();
        break;
      case "all":
        sessions = listAllConsoleSessions();
        break;
      default:
        sessions = listConsoleSessions();
    }

    return NextResponse.json(sessions);
  } catch (err) {
    apiLog.error("failed to list console sessions", err);
    return NextResponse.json(
      { error: "Failed to list console sessions" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, lastActivityAt } = body as {
      id: string;
      lastActivityAt: number;
    };

    if (!id || !lastActivityAt) {
      return NextResponse.json(
        { error: "id and lastActivityAt are required" },
        { status: 400 },
      );
    }

    updateConsoleSessionActivity(id, lastActivityAt);
    return NextResponse.json({ ok: true });
  } catch (err) {
    apiLog.error("PATCH /api/console-sessions failed", err);
    return NextResponse.json(
      { error: "Failed to update session activity" },
      { status: 500 },
    );
  }
}
