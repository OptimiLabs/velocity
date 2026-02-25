import { NextResponse } from "next/server";
import { listAgents, saveAgent } from "@/lib/agents/parser";

/**
 * AI-assisted agent update endpoint.
 * Takes a description of changes and modifies the agent's prompt.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const { name } = await params;
    const { changes } = await request.json();

    if (!changes) {
      return NextResponse.json(
        { error: "changes description is required" },
        { status: 400 },
      );
    }

    const agents = listAgents();
    const agent = agents.find((a) => a.name === name);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Apply changes description to the prompt
    const updatedPrompt = `${agent.prompt}

## Additional Instructions (updated)
${changes}`;

    const updatedAgent = { ...agent, prompt: updatedPrompt };
    saveAgent(updatedAgent);

    return NextResponse.json(updatedAgent);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update agent",
      },
      { status: 500 },
    );
  }
}
