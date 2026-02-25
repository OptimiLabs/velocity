# Provider Capability Matrix (CLI + Velocity)

Last updated: 2026-02-26

This guide separates:
1. What each CLI documents/supports.
2. What Velocity currently supports in-app.

## CLI documented capabilities

| Capability | Claude Code | Codex CLI | Gemini CLI |
| --- | --- | --- | --- |
| Project instruction file | `CLAUDE.md` | `AGENTS.md` | `GEMINI.md` |
| Global instruction file | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | `~/.gemini/GEMINI.md` |
| Global custom skill path | `~/.claude/skills/<name>/SKILL.md` | `~/.codex/skills/<name>/SKILL.md` | `~/.gemini/skills/<name>/SKILL.md` (legacy read: `~/.gemini/velocity/skills`) |
| Project custom skill path | `<project>/.claude/skills/<name>/SKILL.md` | `<project>/.codex/skills/<name>/SKILL.md` | `<project>/.gemini/skills/<name>/SKILL.md` (legacy read: `<project>/.gemini/velocity/skills`) |
| Built-in slash controls | Yes | Yes (`/model`, `/agents`, `/mcp`, etc.) | Yes (`/mcp`, `/extensions`, `/stats`, etc.) |
| Custom skill direct slash invocation (`/my-skill`) | Yes | No (use `/skills` picker or `$skill_name`) | Provider-specific skill/extension flow (not a generic `/my-skill`) |
| Subagents / custom agents | Yes | Yes (`/agents`) | Partial via config/extension patterns |
| Hooks / automation events | Yes | Not documented as Claude-style hooks | Yes (`hooks` in settings) |
| MCP server config | Yes | Yes (`mcp_servers`) | Yes (`mcpServers` / extensions tooling) |
| Sandbox/approval controls | Yes | Yes (`approval_policy`, `sandbox_mode`) | Yes (sandbox + approvals) |
| Session log location | `~/.claude/projects/*/*.jsonl` | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | `~/.gemini/tmp/*.jsonl` |

## Velocity app support (current)

| Area | Claude | Codex | Gemini |
| --- | --- | --- | --- |
| Session ingestion/parsing | Full | Full | Full |
| Session analytics/usage filters | Full | Full | Full |
| Provider-scoped settings tab | Full | Full | Full |
| Skills management page | Full | Full | Full |
| Agents management page | Full | Full | Full |
| Workflows page | Full | Full | Full |
| Workflow "Save Skill" artifact sync | Full | Full | Full |
| Workflow run hint in UI | `/name` | `/skills` or `$name` | `/name` |
| Hooks page (interactive manager) | Full | Not available | Not available |
| Hook conversion/export artifacts | Full | Preview only | Preview only |
| MCP page add/edit/delete | Full | Full | Full |
| MCP enable/disable toggle | Full | Not available | Not available |
| Plugins page | Full | Not available | Not available |
| Marketplace install target | Full | Full (provider-scoped) | Full (provider-scoped) |
| Live console execution/resume | Full | Not available | Not available |

## Workflow "Save Skill" Mapping (Velocity Behavior)

| Provider | Skill artifact path | Router entry behavior | How to run |
| --- | --- | --- | --- |
| Claude | `~/.claude/skills/<name>/SKILL.md` (or project-scoped `.claude/skills`) | Updates `CLAUDE.md` if present | Run `/<name>` |
| Codex | `~/.codex/skills/<name>/SKILL.md` (or project-scoped `.codex/skills`) | Updates `AGENTS.md`; creates it if missing | Use `/skills` picker or mention `$<name>` |
| Gemini | `~/.gemini/skills/<name>/SKILL.md` plus command file `~/.gemini/commands/<name>.toml` (project scope: `<project>/.gemini/commands`) | Updates `GEMINI.md` if present | Run `/<name>` |

## Important Notes

1. Codex custom skills are not generic slash commands. If you save a workflow as `qa`, run it via `/skills` or by mentioning `$qa`, not `/qa`.
2. Velocity's `Commands` page lists globally scoped active custom skills. Project-scoped skills are managed in `Skills`, but not shown as top-level commands.
3. A workflow saved with project scope writes provider project-local skill artifacts (`.claude/skills`, `.codex/skills`, `.gemini/skills`).
4. Gemini compatibility mode: Velocity still reads legacy Gemini skill locations under `.gemini/velocity/skills` while preferring `.gemini/skills` for new artifacts.
5. Gemini workflow deploy writes both a skill artifact and a native Gemini custom command file so slash invocation works directly.

## Velocity API representation

Main provider-aware APIs:
- `GET/PUT /api/settings?provider=claude|codex|gemini`
- `GET /api/tools?provider=...`
- `POST/PATCH/DELETE /api/tools/mcp?provider=...`
- `PUT /api/tools/mcp/toggle?provider=...` (Claude only)
- `GET/POST /api/skills?provider=...`
- `GET/POST/PATCH/DELETE /api/agents?provider=...`
- `GET /api/sessions?provider=...`
- `GET /api/analytics/*?provider=...`
- `POST /api/marketplace/install` with `targetProvider`

## Known gaps and reviewer notes

1. Hooks parity gap:
   Velocity hook UI is Claude-only. Codex/Gemini hook conversion is preview-only and not saved as native provider hook config.
2. Console parity gap:
   PTY/session resume is implemented for Claude sessions only.
3. Invocation UX gap:
   Cross-provider "Save Skill" messaging previously implied slash invocation parity. UI now uses provider-aware guidance, but older screenshots/docs may still show slash-first wording.

## Sources

- Claude Code docs: https://docs.anthropic.com/en/docs/claude-code
- Claude settings: https://docs.anthropic.com/en/docs/claude-code/settings
- Claude hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Claude MCP: https://docs.anthropic.com/en/docs/claude-code/mcp
- Codex docs hub: https://developers.openai.com/codex/
- Codex configuration docs (AGENTS/skills/MCP): https://developers.openai.com/codex/config/
- Codex slash commands: https://developers.openai.com/codex/cli/slash-commands/
- Codex AGENTS.md guide: https://developers.openai.com/codex/guides/agents-md/
- Gemini CLI docs: https://geminicli.com/docs/
- Gemini CLI configuration: https://geminicli.com/docs/cli/configuration
