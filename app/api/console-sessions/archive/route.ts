import { NextResponse } from "next/server";
import {
  archiveConsoleSession,
  type ArchivedTerminal,
} from "@/lib/db/console-sessions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, terminals } = body as {
      id: string;
      terminals: ArchivedTerminal[];
    };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    archiveConsoleSession(id, terminals ?? []);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to archive session" },
      { status: 500 },
    );
  }
}
