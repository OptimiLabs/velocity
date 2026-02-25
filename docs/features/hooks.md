# Hooks [Status: Beta]

AI-assisted generation and management of Claude Code hook configurations. Hooks are event-driven scripts that run at specific points in the Claude Code lifecycle (e.g., before/after tool use, on session start).

## How It Works

### Architecture

1. **Hook Format** -- Claude Code hooks follow a structured format defined in `lib/hooks/matcher.ts`. Each hook event (e.g., `PreToolUse`, `PostToolUse`, `SubagentStop`) maps to an array of rules. Each rule has an optional `matcher` regex (to target specific tools by name) and a `hooks` array of `HookConfig` objects specifying the command to run.

2. **AI Generation** -- `/api/hooks/generate` accepts a natural-language description of the desired hook behavior and returns a structured hook configuration. This lowers the barrier to creating hooks, since users describe what they want rather than writing the JSON structure manually.

3. **Hook Matching** -- `lib/hooks/matcher.ts` classifies hooks by relevance to a given entity: "direct" (PreToolUse/PostToolUse matching the entity's tool), "lifecycle" (agent lifecycle events like SubagentStop), or "global" (unmatched rules that apply broadly).

4. **Validation** -- Generated hooks pass through validation guards before being applied. The validation catches structural issues, missing required fields, and potentially unsafe commands.

### Data Flow

1. User navigates to the Hooks page or the hooks section in settings
2. User describes the desired hook behavior in natural language
3. `/api/hooks/generate` sends the description to an AI model for structured generation
4. The generated configuration is previewed in `HookPreviewDialog.tsx`
5. User reviews and optionally edits the configuration
6. On confirmation, the hook is written to Claude Code's `settings.json`

### Key Components

- `HookPreviewDialog.tsx` (in `components/marketplace/`) -- Preview and edit generated hooks before applying
- `HooksSection.tsx` (in `components/agents/`) -- Display hooks relevant to a specific agent or workflow
- `lib/hooks/matcher.ts` -- Hook rule matching and classification logic

## Usage

### Generating a hook

1. Navigate to the Hooks page
2. Describe what you want the hook to do (e.g., "Run eslint before any file write" or "Log all Bash commands to a file")
3. Review the generated configuration in the preview dialog
4. Edit the configuration if needed
5. Click "Apply" to save it to your Claude Code settings

### Understanding hook events

- **PreToolUse** -- Runs before a tool is invoked. Use the `matcher` field to target specific tools (e.g., `"Bash"`, `"Write"`).
- **PostToolUse** -- Runs after a tool completes. Has access to the tool's output.
- **SubagentStop** / **TaskComplete** -- Lifecycle events for agent orchestrations.

### Viewing hooks for an entity

When viewing an agent or workflow, the Hooks section shows all hooks relevant to that entity, grouped by relevance (direct, lifecycle, global).

## Known Limitations

- **AI output quality varies**: Generated hook configurations may not always be correct or optimal. Complex behaviors may require manual editing after generation.
- **Always review before applying**: The AI may generate commands that have unintended side effects. Review the `command` field in each hook carefully before saving.
- **Validation catches most issues**: The validation layer detects structural problems (missing fields, invalid event names), but cannot verify that shell commands are safe or correct.
- **Limited event types**: Only the hook events supported by Claude Code are available. Custom events are not supported.

## Related Files

- `lib/hooks/matcher.ts` -- Hook rule types, matching logic, and relevance classification
- `app/api/hooks/generate/` -- API route for AI-powered hook generation
- `app/hooks/page.tsx` -- Hooks page
- `components/marketplace/HookPreviewDialog.tsx` -- Hook configuration preview and editor
- `components/agents/HooksSection.tsx` -- Hooks display within agent/workflow views
