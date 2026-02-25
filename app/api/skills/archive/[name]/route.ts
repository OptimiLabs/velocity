import { NextRequest, NextResponse } from "next/server";
import { restoreSkill, deleteArchivedSkill } from "@/lib/skills";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  try {
    const { projectPath } = (await request.json()) as {
      projectPath?: string;
    };

    const ok = restoreSkill(name, projectPath);
    if (!ok) {
      return NextResponse.json(
        { error: "Failed to restore skill" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const projectPath =
    request.nextUrl.searchParams.get("projectPath") || undefined;

  const ok = deleteArchivedSkill(name, projectPath);
  if (!ok) {
    return NextResponse.json(
      { error: "Archived skill not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true });
}
