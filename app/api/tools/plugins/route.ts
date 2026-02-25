import { NextRequest, NextResponse } from "next/server";
import { togglePlugin } from "@/lib/claude-settings";

export async function PUT(request: NextRequest) {
  try {
    const { pluginId, enabled, installPath } = (await request.json()) as {
      pluginId: string;
      enabled: boolean;
      installPath?: string;
    };

    if (!pluginId?.trim()) {
      return NextResponse.json(
        { error: "pluginId is required" },
        { status: 400 },
      );
    }
    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 },
      );
    }
    if (installPath != null && typeof installPath !== "string") {
      return NextResponse.json(
        { error: "installPath must be a string when provided" },
        { status: 400 },
      );
    }

    togglePlugin(pluginId, enabled, installPath);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
