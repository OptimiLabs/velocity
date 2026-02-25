import { NextRequest, NextResponse } from "next/server";
import {
  getProjectPluginOverrides,
  toggleProjectPlugin,
  deleteProjectPluginOverride,
} from "@/lib/claude-settings";

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 },
      );
    }
    const overrides = getProjectPluginOverrides(projectId);
    return NextResponse.json(overrides);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { projectId, pluginId, enabled } = (await request.json()) as {
      projectId: string;
      pluginId: string;
      enabled: boolean;
    };

    if (!projectId || !pluginId) {
      return NextResponse.json(
        { error: "projectId and pluginId are required" },
        { status: 400 },
      );
    }

    toggleProjectPlugin(projectId, pluginId, enabled);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    const pluginId = request.nextUrl.searchParams.get("pluginId");

    if (!projectId || !pluginId) {
      return NextResponse.json(
        { error: "projectId and pluginId are required" },
        { status: 400 },
      );
    }

    deleteProjectPluginOverride(projectId, pluginId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
