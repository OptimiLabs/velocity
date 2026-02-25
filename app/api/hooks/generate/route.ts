import { NextResponse } from "next/server";
import { aiGenerate } from "@/lib/ai/generate";
import { extractFirstJsonObject } from "@/lib/ai/parse";
import { validateHookConfig } from "@/lib/hooks/validate";
import { convertHookTargets } from "@/lib/conversion/artifacts";
import { HOOK_EVENTS } from "@/lib/hooks/hook-editor-constants";
import type { ProviderTargetMode } from "@/types/provider-artifacts";

interface GeneratedReasoning {
  eventChoice?: string;
  matcherChoice?: string;
  failureModes?: string;
}

const KNOWN_EVENTS = new Set(HOOK_EVENTS);
const TOOL_MATCHER_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
]);

const CONDITIONAL_EVENT_HINTS: Record<
  string,
  { keywords: string[]; fallback: string }
> = {
  PermissionRequest: {
    keywords: ["permission", "approval", "approve", "allow", "deny"],
    fallback: "PreToolUse",
  },
  Notification: {
    keywords: ["notification", "notify", "alert", "toast"],
    fallback: "Stop",
  },
  Setup: {
    keywords: ["setup", "onboard", "initialize", "bootstrap", "trust"],
    fallback: "SessionStart",
  },
  TaskCompleted: {
    keywords: ["task completed", "teammate", "orchestr", "delegate", "task done"],
    fallback: "SubagentStop",
  },
  TeammateIdle: {
    keywords: ["teammate idle", "idle", "orchestr", "delegate", "teammate"],
    fallback: "SubagentStop",
  },
  WorktreeCreate: {
    keywords: ["worktree", "branch workspace", "isolated branch"],
    fallback: "SessionStart",
  },
  WorktreeRemove: {
    keywords: ["worktree", "cleanup worktree", "remove worktree"],
    fallback: "SessionEnd",
  },
};

function normalizeGeneratedEvent(
  rawEvent: unknown,
  description: string,
): { event: string; warnings: string[] } {
  const warnings: string[] = [];
  const parsedEvent =
    typeof rawEvent === "string" && rawEvent.trim()
      ? rawEvent.trim()
      : "PostToolUse";

  if (!KNOWN_EVENTS.has(parsedEvent)) {
    warnings.push(
      `Unknown event '${String(rawEvent)}' from generation. Switched to PostToolUse.`,
    );
    return { event: "PostToolUse", warnings };
  }

  const conditional = CONDITIONAL_EVENT_HINTS[parsedEvent];
  if (!conditional) return { event: parsedEvent, warnings };

  const lowerDesc = description.toLowerCase();
  const explicitlyRequested = conditional.keywords.some((kw) =>
    lowerDesc.includes(kw),
  );
  if (explicitlyRequested) return { event: parsedEvent, warnings };

  warnings.push(
    `${parsedEvent} is conditional and may not fire in normal sessions. Switched to ${conditional.fallback}.`,
  );
  return { event: conditional.fallback, warnings };
}

function inferMatcherFallback(
  event: string,
  description: string,
  hookType: string,
  command?: string,
  prompt?: string,
): string | undefined {
  if (!TOOL_MATCHER_EVENTS.has(event)) return undefined;

  const text = `${description}\n${command || ""}\n${prompt || ""}`.toLowerCase();
  if ((command || "").includes("$COMMAND")) return "Bash";
  if ((command || "").includes("$FILE") || (prompt || "").includes("$FILE")) {
    return "Edit|Write";
  }
  if (/\bbash\b|\bshell\b|\bterminal\b|\bcommand\b/.test(text)) {
    return "Bash";
  }
  if (/\bedit\b|\bwrite\b|\bfile\b|\bformat\b|\blint\b|\btype[- ]?check\b/.test(text)) {
    return "Edit|Write";
  }
  if (/\bread\b|\binspect\b|\bscan\b/.test(text)) {
    return "Read";
  }
  if (hookType === "command") return "Edit|Write";
  return "Bash";
}

function buildFallbackExplanation(
  event: string,
  hookType: string,
  matcher?: string,
): string {
  const scope = matcher ? ` scoped to ${matcher}` : "";
  return `${hookType} hook on ${event}${scope} with safe defaults.`;
}

function buildFallbackReasoning(
  event: string,
  matcher?: string,
): GeneratedReasoning {
  return {
    eventChoice: `${event} best matches the requested trigger timing while keeping latency predictable.`,
    matcherChoice: matcher
      ? `${matcher} keeps the hook narrowly scoped to relevant tool calls.`
      : "No matcher is needed for this non-tool event.",
    failureModes:
      "Broad matchers or conditional events can make hooks noisy or non-deterministic across sessions.",
  };
}

const SYSTEM_PROMPT = `You generate Claude Code hook configurations. Return ONLY valid JSON matching this schema:

{
  "event": "<event name>",
  "matcher": "<regex for tool names — REQUIRED for tool events, omit for others>",
  "hook": {
    "type": "command" | "prompt" | "agent",
    "command": "<shell command — REQUIRED for command type>",
    "prompt": "<instructions — REQUIRED for prompt/agent type>",
    "timeout": <seconds>
  },
  "explanation": "<one-line summary>",
  "reasoning": {
    "eventChoice": "<why this event>",
    "matcherChoice": "<why this matcher>",
    "failureModes": "<what breaks with broader config>"
  }
}

MANDATORY RULES:
1. "matcher" goes at TOP LEVEL next to "event", NEVER inside "hook".
2. Hook object accepts ONLY: type, command, prompt, timeout, async. No statusMessage, model, or extras.
3. For tool events (PreToolUse, PostToolUse, PostToolUseFailure), ALWAYS include a matcher.
4. "command" type MUST have "command" field. "prompt"/"agent" types MUST have "prompt" field. Never both.
5. $FILE is ONLY available for file tools (Edit, Write, Read, Glob, Grep). $COMMAND is ONLY for Bash.
6. NEVER use "agent" type on high-frequency events (PreToolUse, PostToolUse, UserPromptSubmit) — too slow.
7. timeout is in SECONDS. Defaults: command 5-10s, prompt 15s, agent 30-60s.
8. prompt/agent hooks MUST include "Context: $ARGUMENTS" and end with JSON response instructions.
9. Conditional events (PermissionRequest, Notification, Setup, TaskCompleted, TeammateIdle, WorktreeCreate, WorktreeRemove) should only be chosen when the user explicitly asks for those flows.
10. Prefer deterministic commands with minimal assumptions (check tool availability, avoid provider-specific globals unless requested).
11. Default to command hooks for speed; use prompt only when semantic review is needed; use agent only when file/tool context is explicitly necessary.
12. Explanations must be practical: mention trigger, scope, and expected behavior in one sentence.

EVENTS (by frequency):
HIGH (every tool call): PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit
  → command type only. prompt ONLY if essential, timeout ≤ 15s. NEVER agent.
MEDIUM (few per session): Stop, SubagentStart, SubagentStop, TaskCompleted, TeammateIdle, PermissionRequest
  → prompt ≤ 15s preferred. agent only if file access essential.
LOW (once per session): SessionStart, SessionEnd, Setup, Notification, PreCompact
  → any type acceptable.
CONDITIONAL (runtime-specific): PermissionRequest, Notification, Setup, TaskCompleted, TeammateIdle, WorktreeCreate, WorktreeRemove
  → choose only if explicitly requested; otherwise prefer stable events (PreToolUse/PostToolUse/Stop/SessionStart/SessionEnd/SubagentStop).

TOOL EVENTS need a matcher — common patterns:
"Bash" (shell), "Edit|Write" (file changes), "Read" (reads), "Glob|Grep" (searches), "Task" (agents), "mcp__.*" (MCP)

TYPES:
"command" — fast shell ops (lint, format, log). Variables: $FILE, $TOOL_NAME, $ARGUMENTS, $COMMAND (Bash only).
"prompt" — lightweight AI check, no file access. End prompt with: "You are a hook evaluator. Your ENTIRE response must be a single JSON object with no other text, no markdown fences, no explanation. Respond: {\\"ok\\": true} or {\\"ok\\": false, \\"reason\\": \\"explanation\\"}"
"agent" — heavy AI with file access. ONLY low-frequency events. End prompt with: "After your analysis, respond with JSON: {\\"ok\\": true} or {\\"ok\\": false, \\"reason\\": \\"explanation\\"}"

INTENT MAPPING (prefer these):
- "lint/format/type-check after edits" → PostToolUse + Edit|Write + command
- "review shell safety before execution" → PreToolUse + Bash + prompt/command
- "end-of-session checks" → Stop or SessionEnd + command/prompt
- "startup/setup checks" → SessionStart (prefer) unless setup flow is explicitly requested
- "team/subagent completion review" → SubagentStop (prefer) unless TaskCompleted/TeammateIdle is explicitly requested

EXAMPLES:

Command — lint after edits:
{ "event": "PostToolUse", "matcher": "Edit|Write", "hook": { "type": "command", "command": "npx eslint --fix \\"$FILE\\"", "timeout": 10 }, "explanation": "Runs ESLint auto-fix after file edits", "reasoning": { "eventChoice": "PostToolUse reacts after edit, doesn't block", "matcherChoice": "Edit|Write targets file changes, $FILE is available", "failureModes": "Without matcher, fires on every tool call with empty $FILE" } }

Prompt — check before stopping:
{ "event": "Stop", "hook": { "type": "prompt", "prompt": "Check ONLY for: (1) repeated failed attempts at the same action, (2) recursive retry loops, (3) silently abandoned errors. If none exist, return ok.\\n\\nContext: $ARGUMENTS\\n\\nYou are a hook evaluator. Your ENTIRE response must be a single JSON object with no other text, no markdown fences, no explanation. Respond: {\\"ok\\": true} or {\\"ok\\": false, \\"reason\\": \\"explanation\\"}", "timeout": 15 }, "explanation": "Fast check for recursive failures before stopping", "reasoning": { "eventChoice": "Stop fires once when session ends, not on tool calls", "matcherChoice": "Stop doesn't use matchers", "failureModes": "Vague criteria like 'check code quality' adds latency with no value" } }

Agent — verify setup on start:
{ "event": "SessionStart", "hook": { "type": "agent", "prompt": "Read the project's CLAUDE.md and verify the development environment is set up. Check that required dependencies exist.\\n\\nContext: $ARGUMENTS\\n\\nAfter your analysis, respond with JSON: {\\"ok\\": true} or {\\"ok\\": false, \\"reason\\": \\"explanation\\"}", "timeout": 30 }, "explanation": "Verifies project setup on session start", "reasoning": { "eventChoice": "SessionStart fires once, so agent latency is acceptable", "matcherChoice": "SessionStart doesn't use matchers", "failureModes": "Using agent on frequent events would add 30-60s per tool call" } }

SELF-CHECK before responding: Does the JSON have matcher at top level (not in hook)? Is type present? Does the right field (command vs prompt) exist? Is the matcher specific enough? Is the type appropriate for the event frequency?`;

export async function POST(request: Request) {
  try {
    const {
      description,
      model: requestedModel,
      provider: requestedProvider,
      targetProvider: requestedTargetProvider,
    } = await request.json();
    const provider =
      typeof requestedProvider === "string" ? requestedProvider.trim() : undefined;
    const allowedProviders = new Set([
      "anthropic",
      "openai",
      "google",
      "openrouter",
      "local",
      "custom",
    ]);
    const targetProvider = (
      requestedTargetProvider === "claude" ||
      requestedTargetProvider === "codex" ||
      requestedTargetProvider === "gemini" ||
      requestedTargetProvider === "all"
        ? requestedTargetProvider
        : "claude"
    ) as ProviderTargetMode;

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 },
      );
    }
    if (provider && !allowedProviders.has(provider)) {
      return NextResponse.json({ error: "invalid provider" }, { status: 400 });
    }

    const userPrompt = `User description: "${description}"`;

    const content = await aiGenerate(userPrompt, {
      system: SYSTEM_PROMPT,
      model: requestedModel,
      ...(provider ? { provider } : {}),
      timeoutMs: 120_000,
    });
    // Extract the first balanced JSON object from the response
    const jsonStr = extractFirstJsonObject(content);
    if (!jsonStr) {
      return NextResponse.json(
        { error: "Failed to generate valid hook configuration" },
        { status: 500 },
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // AI sometimes returns JS-style JSON (unquoted keys, trailing commas, comments).
      // Try cleaning common issues before giving up.
      const cleaned = jsonStr
        .replace(/\/\/[^\n]*/g, "")           // strip line comments
        .replace(/\/\*[\s\S]*?\*\//g, "")     // strip block comments
        .replace(/,\s*([}\]])/g, "$1")        // strip trailing commas
        .replace(/(['"])?(\w+)(['"])?\s*:/g, '"$2":'); // quote unquoted keys
      try {
        parsed = JSON.parse(cleaned);
      } catch (e2) {
        return NextResponse.json(
          { error: `AI returned malformed JSON: ${e2 instanceof Error ? e2.message : "parse error"}` },
          { status: 500 },
        );
      }
    }

    // Strip any fields from hook that Claude Code won't accept
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hook: any = parsed.hook || {};
    // Infer type from fields if the AI omitted it:
    // has "command" field → command type, has "prompt" field → prompt type.
    // Both "prompt" and "agent" types use the prompt field — default to "prompt"
    // (lighter/faster); AI must explicitly set "agent" to get the heavier type.
    let hookType: string = hook.type || (hook.prompt ? "prompt" : hook.command ? "command" : "prompt");

    // Enforce type constraints: "agent" is too slow for high/medium-frequency events.
    // Downgrade to "prompt" (which also uses a prompt field, so the content still works).
    const highFreqEvents = new Set([
      "PreToolUse", "PostToolUse", "PostToolUseFailure", "UserPromptSubmit",
    ]);
    const mediumFreqEvents = new Set([
      "Stop", "SubagentStart", "SubagentStop", "TaskCompleted",
      "TeammateIdle", "PermissionRequest",
    ]);
    const eventNormalization = normalizeGeneratedEvent(parsed.event, description);
    const generatedEvent = eventNormalization.event;
    if (hookType === "agent" && (highFreqEvents.has(generatedEvent) || mediumFreqEvents.has(generatedEvent))) {
      hookType = "prompt";
    }

    const cleanHook: Record<string, unknown> = { type: hookType };
    // AI sometimes places fields at the top level instead of inside hook — fall back.
    // Only include the field appropriate for the type (command xor prompt, never both).
    if (hookType === "command") {
      cleanHook.command = hook.command || parsed.command || "";
    } else {
      // Don't append format hints here — HookEditor's appendPromptFormatHint()
      // handles that on save, using FORMAT_HINT_MARKER for dedup.
      cleanHook.prompt = String(hook.prompt || parsed.prompt || "");
    }
    if (hook.timeout || parsed.timeout) cleanHook.timeout = hook.timeout || parsed.timeout;

    // Validate required fields are present
    if (hookType === "command" && !cleanHook.command) {
      return NextResponse.json(
        { error: "Generated hook of type 'command' is missing required 'command' field" },
        { status: 500 },
      );
    }
    if ((hookType === "prompt" || hookType === "agent") && !cleanHook.prompt) {
      return NextResponse.json(
        { error: `Generated hook of type '${hookType}' is missing required 'prompt' field` },
        { status: 500 },
      );
    }

    // Validate the generated hook config
    const inferredMatcher = inferMatcherFallback(
      generatedEvent,
      description,
      hookType,
      cleanHook.command as string | undefined,
      cleanHook.prompt as string | undefined,
    );
    const finalMatcher = (parsed.matcher || hook.matcher || inferredMatcher) as
      | string
      | undefined;
    const validation = validateHookConfig(generatedEvent, {
      type: hookType,
      command: cleanHook.command as string | undefined,
      prompt: cleanHook.prompt as string | undefined,
      matcher: finalMatcher,
      timeout: (cleanHook.timeout ?? hook.timeout ?? parsed.timeout) as number | undefined,
    });
    const normalizedReasoning: GeneratedReasoning =
      parsed.reasoning &&
      typeof parsed.reasoning === "object" &&
      !Array.isArray(parsed.reasoning)
        ? (parsed.reasoning as GeneratedReasoning)
        : buildFallbackReasoning(generatedEvent, finalMatcher);

    const responsePayload = {
      event: generatedEvent,
      matcher: finalMatcher,
      hook: cleanHook,
      explanation:
        typeof parsed.explanation === "string" && parsed.explanation.trim()
          ? parsed.explanation.trim()
          : buildFallbackExplanation(generatedEvent, hookType, finalMatcher),
      reasoning: {
        ...buildFallbackReasoning(generatedEvent, finalMatcher),
        ...normalizedReasoning,
      },
      warnings: Array.from(
        new Set([
          ...eventNormalization.warnings,
          ...(inferredMatcher && !parsed.matcher && !hook.matcher
            ? [
                `Matcher was inferred as '${inferredMatcher}' to keep this tool event scoped.`,
              ]
            : []),
          ...validation.warnings,
        ]),
      ),
      errors: validation.errors,
    };

    if (targetProvider === "claude") {
      return NextResponse.json(responsePayload);
    }

    const results = convertHookTargets(
      {
        event: generatedEvent,
        matcher: typeof finalMatcher === "string" ? finalMatcher : undefined,
        hook: {
          type: hookType as "command" | "prompt" | "agent",
          command: cleanHook.command as string | undefined,
          prompt: cleanHook.prompt as string | undefined,
          timeout: cleanHook.timeout as number | undefined,
        },
      },
      targetProvider,
    );

    return NextResponse.json({
      targetProvider,
      primary: responsePayload,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Hook generation failed",
      },
      { status: 500 },
    );
  }
}
