import { NextResponse } from "next/server";
import { callProvider, callProviderCLI } from "@/lib/instructions/ai-editor";
import { aiGenerate } from "@/lib/ai/generate";

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

    const providerName =
      typeof provider === "string" && provider.trim().length > 0
        ? provider.trim()
        : undefined;

    if (!providerName) {
      const summary = await aiGenerate(fullPrompt, { timeoutMs: 120_000 });
      return NextResponse.json({
        summary,
        tokensUsed: 0,
        cost: 0,
      });
    }

    if (providerName === "claude-cli") {
      const result = await callProviderCLI(fullPrompt);
      return NextResponse.json({
        summary: result.content,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
      });
    }

    if (providerName === "codex-cli") {
      const summary = await aiGenerate(fullPrompt, {
        provider: "codex-cli",
        timeoutMs: 120_000,
      });
      return NextResponse.json({
        summary,
        tokensUsed: 0,
        cost: 0,
      });
    }

    if (
      providerName === "anthropic" ||
      providerName === "openai" ||
      providerName === "google" ||
      providerName === "openrouter" ||
      providerName === "local" ||
      providerName === "custom"
    ) {
      const result = await callProvider(providerName, fullPrompt);
      return NextResponse.json({
        summary: result.content,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
      });
    }

    return NextResponse.json({ error: "invalid provider" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Summarization failed" },
      { status: 500 },
    );
  }
}
