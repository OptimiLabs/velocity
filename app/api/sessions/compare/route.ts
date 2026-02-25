import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import { aiGenerate } from "@/lib/ai/generate";
import { callProvider } from "@/lib/instructions/ai-editor";
import { buildScopedContext } from "@/lib/parser/session-context-builder";
import { getModelConfig } from "@/lib/compare/models";
import type { Session, ScopeOptions } from "@/types/session";

const PRESETS: Record<string, { label: string; instructions: string }> = {
  efficiency: {
    label: "Efficiency Analysis",
    instructions: `Compare these sessions on cost-effectiveness and efficiency:
1. **Cost & Efficiency** — which session(s) achieved the most per dollar spent and why
2. **Tool Usage Patterns** — notable differences in tool usage strategy
3. **Cache Efficiency** — how well each session utilized caching
4. **Model Usage** — differences in models used and their impact
5. **Key Takeaway** — one actionable insight to improve efficiency`,
  },
  debugging: {
    label: "What went wrong?",
    instructions: `Analyze these sessions for problems and inefficiencies:
1. **Error Indicators** — signs of failures, retries, or wasted work
2. **Cost Anomalies** — unexpectedly high costs or token usage
3. **Inefficient Patterns** — repeated tool calls, excessive reads, or redundant work
4. **Root Causes** — likely reasons for any issues found
5. **Recommendations** — specific actions to avoid these problems`,
  },
  strategy: {
    label: "Which approach was best?",
    instructions: `Compare the approaches taken across these sessions:
1. **Approach Summary** — how each session tackled its task
2. **Tool Strategy** — which tools each session relied on and why
3. **Model Choices** — impact of model selection on outcomes
4. **Effectiveness Ranking** — rank the sessions by overall effectiveness
5. **Best Practices** — what the most effective session did right`,
  },
  accomplishments: {
    label: "Summarize accomplishments",
    instructions: `Summarize what was accomplished across these sessions:
1. **Per-Session Recap** — what each session achieved in 2-3 sentences
2. **Files Touched** — key files read or modified across sessions
3. **Aggregate Stats** — combined cost, tokens, and tool calls
4. **Timeline** — chronological order of work
5. **Overall Summary** — big-picture view of what was done`,
  },
};

const ANALYSIS_PRESETS: Record<string, { label: string; instructions: string }> = {
  efficiency: {
    label: "Efficiency Analysis",
    instructions: `Analyze this session's cost-effectiveness and efficiency:
1. **Cost Breakdown** — where money was spent and whether it was justified
2. **Tool Usage Patterns** — which tools dominated and whether that was optimal
3. **Cache Efficiency** — how well caching was utilized, wasted cache opportunities
4. **Model Usage** — whether the model choice was appropriate for the task
5. **Actionable Improvements** — specific changes to reduce cost or improve throughput next time`,
  },
  debugging: {
    label: "What went wrong?",
    instructions: `Analyze this session for problems and inefficiencies:
1. **Error Indicators** — signs of failures, retries, or wasted work
2. **Cost Anomalies** — unexpectedly high costs or token usage spikes
3. **Inefficient Patterns** — repeated tool calls, excessive reads, or redundant work
4. **Root Causes** — likely reasons for any issues found
5. **Prevention Checklist** — specific actions to prevent these problems in future sessions`,
  },
  strategy: {
    label: "Strategy Review",
    instructions: `Evaluate the approach taken in this session:
1. **Task & Approach** — what was attempted and how it was tackled
2. **Tool Strategy** — which tools were relied on and whether alternatives would have been better
3. **Model Choice Impact** — how the model selection affected outcomes
4. **What Worked Well** — the most effective patterns in this session
5. **Better Alternatives** — concrete suggestions for a more effective approach`,
  },
  accomplishments: {
    label: "Session Summary",
    instructions: `Provide a thorough summary of what was accomplished in this session:
1. **Task Recap** — what the session set out to do and what it achieved
2. **Key Outputs** — files created, modified, or read and their significance
3. **Stats Overview** — cost, tokens, tool calls, and duration in context
4. **Quality Assessment** — how well the task was completed
5. **Follow-up Actions** — what should be done next based on this session's work`,
  },
};

// Rough char-to-token ratio for estimation
const CHARS_PER_TOKEN = 4;

// Tokens per chunk for multi-round summarization (~10k tokens)
const CHUNK_TOKEN_TARGET = 10_000;
// Threshold (in estimated input tokens) above which multi-round is triggered
const MULTI_ROUND_THRESHOLD = 200_000;

const DEFAULT_SCOPE: ScopeOptions = {
  metrics: true,
  summaries: true,
  userPrompts: false,
  assistantResponses: false,
  toolDetails: false,
};

function splitIntoChunks(contextPrompt: string): string[] {
  // Split on "## Session N" boundaries
  const parts = contextPrompt.split(/(?=^## Session \d+)/m);
  const chunks: string[] = [];
  let current = "";
  let currentTokens = 0;

  for (const part of parts) {
    const partTokens = Math.ceil(part.length / CHARS_PER_TOKEN);
    if (currentTokens + partTokens > CHUNK_TOKEN_TARGET && current.length > 0) {
      chunks.push(current);
      current = part;
      currentTokens = partTokens;
    } else {
      current += part;
      currentTokens += partTokens;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function getInstructions(preset?: string, question?: string, mode: "analyze" | "compare" = "compare"): string {
  const presetMap = mode === "analyze" ? ANALYSIS_PRESETS : PRESETS;
  const presetConfig = preset ? presetMap[preset] : undefined;
  if (presetConfig && question) {
    return `${presetConfig.instructions}\n\n## Additional question from the user:\n${question}`;
  }
  if (presetConfig) return presetConfig.instructions;
  if (question) return `## User's specific question:\n${question}`;
  return presetMap.efficiency.instructions;
}

function buildSystemPrompt(
  sessionCount: number,
  mode: "analyze" | "compare" = "compare",
): string {
  if (mode === "analyze" && sessionCount === 1) {
    return `You are an expert Claude Code session analyst. Provide deep, actionable insights about session performance.

## Output format
- Use ## headers for each analysis section
- Include data tables (markdown) where comparing 3+ metrics
- Cite specific numbers from the session data — percentages, token counts, costs
- Say "X was 3.2x more expensive than Y" not "X cost more than Y"
- Be specific and actionable — aim for ~400 words`;
  }

  return `You are an expert Claude Code session analyst. Compare sessions and provide data-driven insights.

## Output format
- Use ## headers for each analysis section
- Include data tables (markdown) where comparing metrics across sessions
- Cite specific numbers — percentages, token counts, costs, ratios
- Compare with specifics: "Session 1 used 45% fewer tokens than Session 2" not "Session 1 was more efficient"
- Be concise — aim for ~${sessionCount <= 3 ? 300 : 400} words`;
}

function buildScopedPrompt(
  profiles: unknown[],
  instructions: string,
  _sessionCount: number,
) {
  const sessionsBlock = profiles
    .map(
      (p: unknown, i: number) =>
        `## Session ${i + 1}\n${JSON.stringify(p, null, 2)}`,
    )
    .join("\n\n");

  return `${sessionsBlock}\n\n${instructions}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sessionIds,
      question,
      preset,
      provider,
      preview,
      scope: rawScope,
      messages: conversationMessages,
      mode = "compare",
    } = body as {
      sessionIds: string[];
      question?: string;
      preset?: string;
      provider?:
        | "claude-cli"
        | "anthropic"
        | "openai"
        | "google"
        | "openrouter"
        | "local"
        | "custom"
        | string;
      preview?: boolean;
      scope?: Partial<ScopeOptions>;
      messages?: Array<{ role: string; content: string }>;
      mode?: "analyze" | "compare";
    };

    if (
      !Array.isArray(sessionIds) ||
      sessionIds.length < 1 ||
      sessionIds.some((id) => typeof id !== "string")
    ) {
      return NextResponse.json(
        { error: "Provide at least 1 session ID" },
        { status: 400 },
      );
    }

    // Auto-detect mode from session count if not explicitly provided
    const effectiveMode = mode || (sessionIds.length === 1 ? "analyze" : "compare");

    await ensureIndexed();
    const db = getDb();

    const placeholders = sessionIds.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT * FROM sessions WHERE id IN (${placeholders})`)
      .all(...sessionIds) as Session[];
    const sessionMap = new Map(rows.map((s) => [s.id, s]));
    const sessions = sessionIds.map((id) => {
      const row = sessionMap.get(id);
      if (!row) throw new Error(`Session ${id} not found`);
      return row;
    });

    const scope: ScopeOptions = { ...DEFAULT_SCOPE, ...rawScope };

    // For single-session analysis mode, auto-enrich context for deeper insights
    if (effectiveMode === "analyze" && sessions.length === 1) {
      if (!rawScope?.messageLimit) scope.messageLimit = 100;
      if (rawScope?.toolDetails === undefined) scope.toolDetails = true;
    }

    const { profiles, estimatedInputTokens: scopedTokens } =
      await buildScopedContext(sessions, scope);

    // Build scope breakdown from already-built profiles (single pass, no extra I/O)
    const scopeBreakdown: Record<string, number> = {};
    const scopeFields = [
      "metrics",
      "summaries",
      "userPrompts",
      "assistantResponses",
      "toolDetails",
    ] as const;
    let scopeDataTokens = 0;
    for (const key of scopeFields) {
      if (scope[key]) {
        let chars = 0;
        for (const profile of profiles) {
          const value = (profile as unknown as Record<string, unknown>)[key];
          if (value) chars += JSON.stringify(value).length;
        }
        const tokens = Math.ceil(chars / CHARS_PER_TOKEN);
        scopeBreakdown[key] = tokens;
        scopeDataTokens += tokens;
      }
    }

    const instructions = getInstructions(preset, question, effectiveMode);
    const contextPrompt = buildScopedPrompt(
      profiles,
      instructions,
      sessions.length,
    );

    // Model-aware cost estimation
    const modelConfig = getModelConfig(provider || "claude-cli");
    const estimatedInputTokens = conversationMessages
      ? scopedTokens +
        Math.ceil(
          conversationMessages.reduce((sum, m) => sum + m.content.length, 0) /
            CHARS_PER_TOKEN,
        )
      : Math.ceil(contextPrompt.length / CHARS_PER_TOKEN);

    // Add overhead so individual breakdowns sum to total
    const overhead = Math.max(0, estimatedInputTokens - scopeDataTokens);
    if (overhead > 0) {
      scopeBreakdown._overhead = overhead;
    }
    const estimatedOutputTokens = 500;

    // Check if multi-round summarization is needed/enabled
    const multiRoundEnabled = scope.multiRoundSummarization === true;
    const requiresMultiRound =
      multiRoundEnabled && estimatedInputTokens > MULTI_ROUND_THRESHOLD;
    const chunks = requiresMultiRound
      ? splitIntoChunks(contextPrompt)
      : [];
    const estimatedChunks = chunks.length;

    // For multi-round, estimate total cost across all rounds
    let estimatedCost: number;
    if (requiresMultiRound && estimatedChunks > 0) {
      // Phase 1: each chunk as input + ~300 token output per chunk
      const phase1InputTokens = estimatedInputTokens;
      const phase1OutputTokens = 300 * estimatedChunks;
      // Phase 2: summaries as input (~300 tokens each) + final output
      const phase2InputTokens = phase1OutputTokens;
      const phase2OutputTokens = estimatedOutputTokens;
      const totalInput = phase1InputTokens + phase2InputTokens;
      const totalOutput = phase1OutputTokens + phase2OutputTokens;
      estimatedCost =
        (totalInput * modelConfig.inputPrice +
          totalOutput * modelConfig.outputPrice) /
        1_000_000;
    } else {
      estimatedCost =
        (estimatedInputTokens * modelConfig.inputPrice +
          estimatedOutputTokens * modelConfig.outputPrice) /
        1_000_000;
    }

    // Preview mode: return estimates only
    if (preview) {
      return NextResponse.json({
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedCost,
        promptLength: contextPrompt.length,
        scopeBreakdown,
        ...(multiRoundEnabled && { requiresMultiRound, estimatedChunks }),
      });
    }

    // Execute comparison
    let analysis: string;
    let tokensUsed = 0;
    let actualCost = 0;

    // Helper: call the appropriate model
    async function callModel(prompt: string, systemPrompt?: string): Promise<{
      content: string;
      tokensUsed: number;
      cost: number;
    }> {
      if (modelConfig.provider === "claude-cli") {
        const content = await aiGenerate(prompt, {
          system: systemPrompt,
          model: modelConfig.modelId || undefined,
          timeoutMs: 180_000,
        });
        return { content, tokensUsed: 0, cost: 0 };
      }
      // callProvider doesn't support system param — prepend if needed
      const fullPrompt = systemPrompt
        ? `${systemPrompt}\n\n---\n\n${prompt}`
        : prompt;
      const result = await callProvider(
        modelConfig.provider,
        fullPrompt,
        modelConfig.modelId || undefined,
      );
      return {
        content: result.content,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
      };
    }

    const systemPrompt = buildSystemPrompt(sessions.length, effectiveMode);

    // Multi-round summarization path
    if (requiresMultiRound && chunks.length > 0) {
      if (modelConfig.provider === "claude-cli") {
        // Fast path: combine all chunks into a single prompt for CLI
        // claude-cli has no strict token limit, so we avoid spawning N+1 sessions
        const batchedPrompt = `The data is split into ${chunks.length} sections for organization.

${instructions}

${chunks.map((chunk, i) => `## Section ${i + 1}/${chunks.length}\n${chunk}`).join("\n\n")}

Combine insights from ALL sections into a single, coherent analysis. Resolve contradictions between sections — don't just concatenate.`;
        const result = await callModel(batchedPrompt, systemPrompt);
        analysis = result.content;
        tokensUsed = result.tokensUsed;
        actualCost = result.cost;
      } else {
        // API providers: use multi-round chunking due to token limits
        const chunkSummaries: string[] = [];
        let totalTokens = 0;
        let totalCost = 0;

        // Phase 1: summarize each chunk
        for (let i = 0; i < chunks.length; i++) {
          const chunkPrompt = `Summarizing chunk ${i + 1}/${chunks.length} of a session comparison.\n\nExtract key data points, metrics, patterns, and notable findings from this section:\n\n${chunks[i]}\n\nProvide a concise summary focusing on quantitative data and key insights.`;
          const result = await callModel(chunkPrompt, systemPrompt);
          chunkSummaries.push(result.content);
          totalTokens += result.tokensUsed;
          totalCost += result.cost;
        }

        // Phase 2: synthesize all chunk summaries
        const synthesisPrompt = `Synthesize these chunk summaries into a coherent analysis. Resolve contradictions between chunks — don't just concatenate.\n\n${instructions}\n\n${chunkSummaries.map((s, i) => `## Chunk ${i + 1} Summary\n${s}`).join("\n\n")}`;
        const synthesisResult = await callModel(synthesisPrompt, systemPrompt);
        analysis = synthesisResult.content;
        tokensUsed = totalTokens + synthesisResult.tokensUsed;
        actualCost = totalCost + synthesisResult.cost;
      }
    } else if (conversationMessages && conversationMessages.length > 0) {
      // Multi-turn mode
      if (modelConfig.provider === "claude-cli") {
        const fullPrompt = [
          contextPrompt,
          "",
          "--- Conversation history ---",
          ...conversationMessages.map(
            (m) =>
              `\n${m.role === "user" ? "User" : "Assistant"}: ${m.content}`,
          ),
        ].join("\n");
        analysis = await aiGenerate(fullPrompt, {
          system: systemPrompt,
          model: modelConfig.modelId || undefined,
          timeoutMs: 180_000,
        });
      } else {
        const sessionData = buildScopedPrompt(
          profiles,
          "Answer the user's questions about these sessions using the data provided.",
          sessions.length,
        );
        const allMessages = [
          { role: "user" as const, content: sessionData },
          {
            role: "assistant" as const,
            content:
              "I've reviewed the session data. What would you like to know?",
          },
          ...conversationMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];
        const flatPrompt = allMessages
          .map(
            (m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`,
          )
          .join("\n\n");
        const result = await callProvider(
          modelConfig.provider,
          flatPrompt,
          modelConfig.modelId || undefined,
        );
        analysis = result.content;
        tokensUsed = result.tokensUsed;
        actualCost = result.cost;
      }
    } else {
      // Single-shot mode
      const result = await callModel(contextPrompt, systemPrompt);
      analysis = result.content;
      tokensUsed = result.tokensUsed;
      actualCost = result.cost;
    }

    return NextResponse.json({
      analysis,
      tokensUsed,
      cost: actualCost,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCost,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Comparison failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
