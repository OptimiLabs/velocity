import { NextRequest, NextResponse } from "next/server";
import { mergeSkillsWithAI } from "@/lib/instructions/ai-editor";
import { getSkill, getProjectSkill } from "@/lib/skills";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      skills: Array<{
        name: string;
        origin: "user" | "plugin";
        projectPath?: string;
        content?: string;
      }>;
      prompt: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      provider?: "anthropic" | "openai" | "custom" | "claude-cli";
    };

    if (!body.skills || body.skills.length < 2) {
      return NextResponse.json(
        { error: "At least 2 skills are required for merging" },
        { status: 400 },
      );
    }

    if (!body.prompt?.trim()) {
      return NextResponse.json(
        { error: "Merge prompt is required" },
        { status: 400 },
      );
    }

    // Load skill contents
    const skillContents: { name: string; content: string }[] = [];
    for (const s of body.skills) {
      if (s.origin === "plugin" && s.content) {
        // Plugin skills: content sent directly from the client
        skillContents.push({ name: s.name, content: s.content });
      } else {
        const skill = s.projectPath
          ? getProjectSkill(s.projectPath, s.name)
          : getSkill(s.name);

        if (!skill) {
          return NextResponse.json(
            { error: `Skill "${s.name}" not found` },
            { status: 404 },
          );
        }

        skillContents.push({ name: s.name, content: skill.content });
      }
    }

    const result = await mergeSkillsWithAI(
      skillContents,
      body.prompt,
      body.provider || "anthropic",
      body.history,
    );

    return NextResponse.json({
      content: result.content,
      name: result.name,
      description: result.description,
      category: result.category,
      tokensUsed: result.tokensUsed,
      cost: result.cost,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
