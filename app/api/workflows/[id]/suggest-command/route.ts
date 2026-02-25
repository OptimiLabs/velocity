import { NextRequest, NextResponse } from "next/server";
import { getWorkflow } from "@/lib/db/workflows";
import { slugify } from "@/lib/workflows/command-prompt";
import { aiGenerate } from "@/lib/ai/generate";
import { extractFirstJsonObject } from "@/lib/ai/parse";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const workflow = getWorkflow(id, { includeAgents: false });
    if (!workflow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Try AI-powered suggestion (provider-parity via shared aiGenerate helper)
    try {
      const result = await suggestWithAI(workflow);
      return NextResponse.json(result);
    } catch {
      // Fallback below when no provider is configured or the provider call fails
    }

    // Fallback: derive from workflow name/description
    return NextResponse.json({
      commandName: slugify(workflow.name) || "workflow",
      description:
        workflow.description || `Run the "${workflow.name}" workflow`,
      activationContext:
        workflow.nodes.length > 0
          ? `Use this command when you need to ${workflow.name.toLowerCase()}. It orchestrates ${workflow.nodes.length} steps: ${workflow.nodes.map((n) => n.label).join(", ")}.`
          : `Use this command to run the "${workflow.name}" workflow.`,
    });
  } catch (err) {
    console.error("Suggest command error:", err);
    return NextResponse.json(
      { error: "Failed to suggest command" },
      { status: 500 },
    );
  }
}

async function suggestWithAI(
  workflow: {
    name: string;
    description: string;
    nodes: { label: string; taskDescription: string }[];
  },
): Promise<{
  commandName: string;
  description: string;
  activationContext: string;
}> {
  const systemPrompt = `You are a CLI skill naming expert. Given a workflow (multi-step agent pipeline), suggest a slash command name, description, and activation context.

Return ONLY valid JSON:
{
  "commandName": "kebab-case-name (no leading slash, max 40 chars)",
  "description": "One-line description (max 100 chars) of what the command does",
  "activationContext": "A paragraph describing when a user or AI should invoke this command. Be specific about the scenarios, project types, or triggers."
}

Rules:
- commandName: kebab-case, concise, action-oriented (e.g. "refactor-auth", "add-tests", "deploy-staging")
- description: starts with a verb, no period at end
- activationContext: 2-3 sentences, specific to the workflow's purpose`;

  const userMessage = `Workflow: "${workflow.name}"
Description: ${workflow.description || "(none)"}
Steps:
${workflow.nodes.map((n, i) => `${i + 1}. ${n.label}: ${n.taskDescription}`).join("\n")}`;

  const text = await aiGenerate(userMessage, {
    system: systemPrompt,
    timeoutMs: 60_000,
  });
  const jsonText = extractFirstJsonObject(text);
  if (!jsonText) throw new Error("No valid JSON in AI response");
  const parsed = JSON.parse(jsonText);
  return {
    commandName: parsed.commandName || slugify(workflow.name),
    description: parsed.description || workflow.description,
    activationContext: parsed.activationContext || "",
  };
}
