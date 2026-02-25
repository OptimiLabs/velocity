# AI Agent Quick Builder — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the "Build with AI" agent builder actually use AI to generate thoughtful agent configs, and simplify the modal by hiding tools behind an Advanced section.

**Architecture:** Replace the template-based `/api/agents/build` route with a `claudeOneShot` call. The AI generates creative fields (name, description, prompt, color, tools) while preserving user selections (model, effort). The UI is simplified to description + model + effort, with tools in a collapsible Advanced section.

**Tech Stack:** `lib/ai/claude.ts` (`claudeOneShot`), Next.js API route, React + shadcn/ui

---

### Task 1: Rewrite API route to use claudeOneShot

**Files:**

- Modify: `app/api/agents/build/route.ts` (entire file)

**Step 1: Replace route with claudeOneShot implementation**

Replace the entire file with:

```typescript
import { NextResponse } from "next/server";
import { claudeOneShot } from "@/lib/ai/claude";

const SYSTEM_PROMPT = `You generate Claude Code agent configurations as JSON. Output ONLY valid JSON, no markdown fences, no commentary.

The JSON must have these fields:
- "name": kebab-case, max 30 chars, descriptive
- "description": one concise sentence summarizing the agent's purpose
- "prompt": a detailed system prompt for the agent (multi-paragraph, covers purpose, guidelines, workflow, constraints)
- "tools": array of tool names appropriate for this agent's purpose
- "color": a hex color that fits the agent's domain (pick from: #ef4444 red, #f97316 orange, #eab308 yellow, #22c55e green, #3b82f6 blue, #7c3aed violet, #ec4899 pink, #06b6d4 cyan)

Available tools: Read, Write, Edit, Bash, Glob, Grep, Task, WebFetch, WebSearch, NotebookEdit

The "prompt" field is the most important — it should be a thoughtful, detailed system prompt that gives the agent clear purpose, specific guidelines relevant to its domain, and a structured workflow. Do NOT use generic boilerplate like "be thorough" or "ask for clarification". Make it specific to what this agent actually does.`;

export async function POST(request: Request) {
  try {
    const {
      description,
      model = "sonnet",
      effort,
      tools,
    } = await request.json();

    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 },
      );
    }

    const toolsConstraint = tools?.length
      ? `\nThe user has specifically selected these tools: ${JSON.stringify(tools)}. Use exactly these tools in your output.`
      : "\nChoose the most appropriate tools for this agent's purpose.";

    const userPrompt = `Generate an agent configuration for the following purpose:\n\n${description}${toolsConstraint}`;

    const raw = await claudeOneShot(userPrompt, undefined, 60_000, "sonnet");

    // Extract JSON from response (handle potential markdown fences)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 500 },
      );
    }

    const generated = JSON.parse(jsonMatch[0]);

    // Merge: AI generates creative fields, user selections are preserved
    const config = {
      name: generated.name || "unnamed-agent",
      description: generated.description || description.slice(0, 200),
      model,
      ...(effort && { effort }),
      tools: tools?.length
        ? tools
        : generated.tools || ["Read", "Glob", "Grep"],
      prompt: generated.prompt || description,
      color: generated.color || "#3b82f6",
    };

    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to build agent",
      },
      { status: 500 },
    );
  }
}
```

Note: We pass `"sonnet"` as the model for the generation call itself (fast + capable enough for config generation), regardless of what model the user selected for their agent.

**Step 2: Verify the route compiles**

Run: `cd /Users/jaelee/side-projects/claude-best && bunx tsc --noEmit app/api/agents/build/route.ts 2>&1 | head -20`

Expected: No errors (or only unrelated errors from other files)

**Step 3: Commit**

```bash
git add app/api/agents/build/route.ts
git commit -m "feat: use claudeOneShot for AI agent builder instead of template"
```

---

### Task 2: Simplify AgentBuilder modal — hide tools behind Advanced

**Files:**

- Modify: `components/agents/AgentBuilder.tsx` (lines 214-295)

**Step 1: Add state for Advanced toggle and wrap tools section**

Add `showAdvanced` state after the existing state declarations (after line 72):

```typescript
const [showAdvanced, setShowAdvanced] = useState(false);
```

**Step 2: Replace the tools section with a collapsible Advanced block**

Replace lines 215-295 (the entire tools `<div>` block) with:

```tsx
<div>
  <button
    type="button"
    onClick={() => setShowAdvanced((v) => !v)}
    className="flex items-center gap-1 text-meta uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
  >
    <ChevronRight
      size={10}
      className={cn("transition-transform", showAdvanced && "rotate-90")}
    />
    Advanced
  </button>

  {showAdvanced && (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-meta text-muted-foreground">
          Tools {selectedTools.size > 0 && `(${selectedTools.size} selected)`}
        </span>
        <button
          type="button"
          onClick={() => {
            if (selectedTools.size === availableTools.length) {
              setSelectedTools(new Set());
            } else {
              setSelectedTools(new Set(availableTools.map((t) => t.name)));
            }
          }}
          className="text-meta text-muted-foreground hover:text-foreground transition-colors"
        >
          {selectedTools.size === availableTools.length &&
          availableTools.length > 0
            ? "Clear all"
            : "Select all"}
        </button>
      </div>
      <div className="flex gap-1 flex-wrap">
        {TOOL_PRESETS.map((preset) => {
          const active =
            preset.tools.length > 0 &&
            preset.tools.every((t) => selectedTools.has(t));
          return (
            <button
              key={preset.label}
              type="button"
              title={preset.description}
              onClick={() => {
                if (active) {
                  setSelectedTools((prev) => {
                    const next = new Set(prev);
                    for (const t of preset.tools) next.delete(t);
                    return next;
                  });
                } else {
                  setSelectedTools((prev) => {
                    const next = new Set(prev);
                    for (const t of preset.tools) next.add(t);
                    return next;
                  });
                }
              }}
              className={cn(
                "px-2 py-0.5 rounded-full text-meta font-medium border transition-colors",
                active
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="space-y-2 max-h-[140px] overflow-y-auto">
        <ToolSection
          label="Builtin"
          tools={builtinTools}
          activeColor="border-primary/50 bg-primary/10"
        />
        <ToolSection
          label="MCP Servers"
          tools={mcpTools}
          activeColor="border-chart-1/50 bg-chart-1/10"
        />
        <ToolSection
          label="Plugins"
          tools={pluginTools}
          activeColor="border-chart-4/50 bg-chart-4/10"
        />
        {availableTools.length === 0 && (
          <span className="text-meta text-text-tertiary">Loading tools...</span>
        )}
      </div>
      <p className="text-meta text-muted-foreground/60">
        Leave empty to let AI pick appropriate tools
      </p>
    </div>
  )}
</div>
```

**Step 3: Add ChevronRight to imports**

Update the lucide-react import (line 6) to include `ChevronRight`:

```typescript
import {
  Sparkles,
  Loader2,
  Wrench,
  Server,
  Puzzle,
  ChevronRight,
} from "lucide-react";
```

**Step 4: Update handleBuild to only send tools if user selected them**

Replace the body of the fetch call (lines 100-105) — change `tools: [...selectedTools]` to only include tools when the user actually selected some:

```typescript
        body: JSON.stringify({
          description: description.trim(),
          model,
          effort,
          ...(selectedTools.size > 0 && { tools: [...selectedTools] }),
        }),
```

**Step 5: Verify compilation**

Run: `cd /Users/jaelee/side-projects/claude-best && bunx tsc --noEmit components/agents/AgentBuilder.tsx 2>&1 | head -20`

**Step 6: Commit**

```bash
git add components/agents/AgentBuilder.tsx
git commit -m "feat: simplify agent builder modal — hide tools behind Advanced section"
```

---

### Task 3: Manual verification

**Step 1: Start the dev server**

Run: `cd /Users/jaelee/side-projects/claude-best && bun dev`

**Step 2: Test the flow**

1. Open the agents page
2. Click "Build with AI"
3. Enter a description like "A security auditor that reviews code for OWASP top 10 vulnerabilities"
4. Select a model and effort
5. Click Generate — should show loading spinner, then open AgentEditor with AI-generated config
6. Verify: model and effort match your selections, prompt is detailed and specific (not generic boilerplate), tools are appropriate

**Step 3: Test Advanced tools**

1. Open builder again
2. Expand Advanced, select specific tools
3. Generate — verify those exact tools appear in the result

**Step 4: Commit final state if needed**

```bash
git add -A
git commit -m "feat: AI agent builder — complete"
```
