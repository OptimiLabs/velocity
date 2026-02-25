import { NextResponse } from "next/server";
import { callProvider, callProviderCLI } from "@/lib/instructions/ai-editor";

const SUMMARIZE_PROMPT = `<instructions>
Summarize the following documentation into a concise knowledge file suitable for an AI coding assistant.
Guidelines:
- Keep under 800 tokens
- Focus on actionable guidelines, patterns, and rules
- Use bullet points and short sections
- Preserve code examples if they illustrate important patterns
- Remove navigation, marketing copy, and boilerplate
Return ONLY the summarized markdown content — no explanations, no code fences, no preamble.
</instructions>

<content>
`;

export async function POST(request: Request) {
  try {
    const { content, provider, prompt: customPrompt } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 },
      );
    }

    const fullPrompt = customPrompt
      ? `<instructions>\n${customPrompt}\nReturn ONLY the updated markdown — no explanations.\n</instructions>\n\n<content>\n${content}\n</content>`
      : `${SUMMARIZE_PROMPT}${content}\n</content>`;

    const effectiveProvider = provider || "anthropic";
    let result;

    if (effectiveProvider === "claude-cli") {
      result = await callProviderCLI(fullPrompt);
    } else {
      result = await callProvider(effectiveProvider, fullPrompt);
    }

    return NextResponse.json({
      summary: result.content,
      tokensUsed: result.tokensUsed,
      cost: result.cost,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Summarization failed" },
      { status: 500 },
    );
  }
}
