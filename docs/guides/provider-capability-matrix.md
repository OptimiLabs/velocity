# Provider Capability Matrix (CLI + Velocity)

Last updated: 2026-02-25

This guide separates:
1. What each CLI documents/supports.
2. What Velocity currently supports in-app.

## CLI documented capabilities

| Capability | Claude Code | Codex CLI | Gemini CLI |
| --- | --- | --- | --- |
| Project instruction file | `CLAUDE.md` | `AGENTS.md` | `GEMINI.md` |
| Global instruction file | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | `~/.gemini/GEMINI.md` |
| Project-level reusable skills | Yes (`.claude/commands`, `.claude/skills`) | Yes (`.codex/skills`) | Yes (`.gemini/GEMINI.md`, extensions/hooks model) |
| Subagents / custom agents | Yes | Yes (`/agents`) | Partial via config/extension patterns |
| Hooks / automation events | Yes | Not documented as Claude-style hooks | Yes (`hooks` in settings) |
| MCP server config | Yes | Yes (`mcp_servers`) | Yes (`mcpServers` / extensions tooling) |
| Slash-command style control | Yes | Yes (`/model`, `/agents`, `/mcp`, etc.) | Yes (`/mcp`, `/extensions`, `/stats`, etc.) |
| Sandbox/approval controls | Yes | Yes (`approval_policy`, `sandbox_mode`) | Yes (sandbox + approvals) |

## Velocity app support (current)

| Area | Claude | Codex | Gemini |
| --- | --- | --- | --- |
| Session ingestion/parsing | Full | Full | Full |
| Session analytics/usage filters | Full | Full | Full |
| Provider-scoped settings tab | Full | Full | Full |
| Skills management page | Full | Full | Full |
| Agents management page | Full | Full | Full |
| Workflows page | Full | Full | Full |
| Hooks page (interactive manager) | Full | Not available | Not available |
| Hook conversion/export artifacts | Full | Preview only | Preview only |
| MCP page add/edit/delete | Full | Full | Full |
| MCP enable/disable toggle | Full | Not available | Not available |
| Plugins page | Full | Not available | Not available |
| Marketplace install target | Full | Full (provider-scoped) | Full (provider-scoped) |
| Live console execution/resume | Full | Not available | Not available |

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

## Sources

- Claude Code docs: https://docs.anthropic.com/en/docs/claude-code
- Claude settings: https://docs.anthropic.com/en/docs/claude-code/settings
- Claude hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Claude MCP: https://docs.anthropic.com/en/docs/claude-code/mcp
- Codex docs hub: https://developers.openai.com/codex/
- Codex configuration docs (AGENTS/skills/MCP): https://developers.openai.com/codex/config/
- Gemini CLI docs: https://geminicli.com/docs/
- Gemini CLI configuration: https://geminicli.com/docs/cli/configuration
