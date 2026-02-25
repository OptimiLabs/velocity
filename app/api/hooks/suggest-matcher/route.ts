import { NextResponse } from "next/server";
import { aiGenerate } from "@/lib/ai/generate";
import { extractFirstJsonObject } from "@/lib/ai/parse";

/** Events that don't support tool matchers */
const NON_TOOL_EVENTS = new Set([
  "SessionStart",
  "SessionEnd",
  "Stop",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "UserPromptSubmit",
  "TaskCompleted",
  "TeammateIdle",
  "Setup",
  "ConfigChange",
  "WorktreeCreate",
  "WorktreeRemove",
]);

const SYSTEM_PROMPT = `You are a Claude Code hooks matcher expert. Given a hook's event, type, and command/prompt, suggest the most appropriate tool matcher regex.

Common matchers:
- "Bash" — shell commands
- "Edit|Write" — file modifications
- "Read" — file reads
- "Glob|Grep" — file search
- "WebFetch|WebSearch" — web actions
- "Task" — agent/subagent spawning
- "mcp__.*" — MCP tool calls

Return ONLY valid JSON (no markdown):
{ "matcher": "<regex>", "reason": "<brief explanation>" }

Examples:

Input: event=PreToolUse, type=command, command="npx eslint --fix \\"$FILE\\""
Output: { "matcher": "Edit|Write", "reason": "ESLint fix targets file modifications" }

Input: event=PostToolUse, type=prompt, prompt="Review bash commands for safety..."
Output: { "matcher": "Bash", "reason": "Safety review specifically targets shell commands" }

Input: event=PreToolUse, type=command, command="echo \\"File read: $TOOL_NAME\\""
Output: { "matcher": "Read", "reason": "Logging hook targets file read operations" }

Specificity rules (follow strictly):
- NEVER suggest ".*" unless the hook genuinely applies to every single tool (Bash, Edit, Write, Read, Glob, Grep, WebFetch, Task, etc.). This is extremely rare.
- Prefer the narrowest match: suggest "Edit" over "Edit|Write" if only edits matter. Only add tools that the hook actually needs.
- If the command/prompt uses $FILE, ONLY suggest file-providing tools: Edit, Write, Read, Glob, Grep. Tools like Bash, Task, WebFetch do NOT provide $FILE — the variable will be empty and cause errors.
- If the command/prompt uses $COMMAND, only suggest "Bash" — other tools don't provide shell commands.
- Consider what happens when the hook fires on a non-matching tool: if the command would error (e.g. linting an empty $FILE path), that tool must be excluded.
- Combine related tools with | only when the hook genuinely applies to all of them (e.g. "Edit|Write" for any file modification).
- Analyze the command/prompt content carefully to infer which tools are relevant — don't guess broadly.`;

export async function POST(request: Request) {
  try {
    const {
      event,
      type,
      command,
      prompt,
      model: requestedModel,
    } = await request.json();

    if (!event) {
      return NextResponse.json({ error: "event is required" }, { status: 400 });
    }

    // Non-tool events don't support matchers
    if (NON_TOOL_EVENTS.has(event)) {
      return NextResponse.json({
        matcher: "",
        reason: `${event} is not a tool event and does not support matchers.`,
      });
    }

    const hookDescription =
      type === "command"
        ? `Command: ${command || "(empty)"}`
        : `Prompt: ${prompt || "(empty)"}`;

    const userPrompt = `Hook event: ${event}\nHook type: ${type}\n${hookDescription}\n\nSuggest the best matcher for this hook.`;

    const content = await aiGenerate(userPrompt, {
      system: SYSTEM_PROMPT,
      model: requestedModel,
      timeoutMs: 30_000,
    });
    const jsonStr = extractFirstJsonObject(content);
    if (!jsonStr) {
      return NextResponse.json(
        { error: "Failed to generate matcher suggestion" },
        { status: 500 },
      );
    }

    const parsed = JSON.parse(jsonStr);
    return NextResponse.json({
      matcher: parsed.matcher || "",
      reason: parsed.reason || "",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Matcher suggestion failed",
      },
      { status: 500 },
    );
  }
}
