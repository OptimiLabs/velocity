import { NextRequest, NextResponse } from "next/server";
import { archiveSkill, listArchivedSkills } from "@/lib/skills";

export async function GET() {
  try {
    const archived = listArchivedSkills();
    return NextResponse.json(archived);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { skills } = (await request.json()) as {
      skills: Array<{
        name: string;
        projectPath?: string;
        filePath?: string;
      }>;
    };

    if (!skills || skills.length === 0) {
      return NextResponse.json(
        { error: "skills array is required" },
        { status: 400 },
      );
    }

    let archived = 0;
    for (const s of skills) {
      if (archiveSkill(s.name, s.projectPath, s.filePath)) {
        archived++;
      }
    }

    return NextResponse.json({ archived, total: skills.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
