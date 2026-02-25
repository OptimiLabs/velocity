import { NextResponse } from "next/server";
import { restoreConsoleSession } from "@/lib/db/console-sessions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id } = body as { id: string };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const session = restoreConsoleSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch {
    return NextResponse.json(
      { error: "Failed to restore session" },
      { status: 500 },
    );
  }
}
