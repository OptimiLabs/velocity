import { NextRequest, NextResponse } from "next/server";
import { getWorkflowAgent } from "@/lib/db/workflow-agents";
import { saveAgent } from "@/lib/agents/parser";
import { AGENTS_DIR } from "@/lib/claude-paths";
import path from "path";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  try {
    const { id, name } = await params;
    const decodedName = decodeURIComponent(name);
    const scoped = getWorkflowAgent(id, decodedName);
    if (!scoped) {
      return NextResponse.json(
        { error: "Scoped agent not found" },
        { status: 404 },
      );
    }

    saveAgent({
      name: scoped.name,
      description: scoped.description,
      model: scoped.model,
      effort: scoped.effort as "low" | "medium" | "high" | undefined,
      tools: scoped.tools,
      disallowedTools: scoped.disallowedTools,
      color: scoped.color,
      icon: scoped.icon,
      category: scoped.category,
      prompt: scoped.prompt,
      skills: scoped.skills,
      filePath: path.join(AGENTS_DIR, `${scoped.name}.md`),
      source: "custom",
      enabled: true,
    });

    return NextResponse.json({ success: true, name: scoped.name });
  } catch (err) {
    console.error("Promote workflow agent error:", err);
    return NextResponse.json(
      { error: "Failed to promote agent" },
      { status: 500 },
    );
  }
}
