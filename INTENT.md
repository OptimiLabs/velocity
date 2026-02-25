# Gemini CLI Integration — Intent Document

## Problem Statement

The velocity app currently supports two CLI tools: Claude Code (`claude`) and Codex CLI (`codex`). Google's Gemini CLI (`gemini`) is a third major AI coding CLI that stores sessions, configuration, and instruction files in its own format. Users who use Gemini CLI alongside Claude/Codex need the same level of support: session discovery, cost tracking, instruction indexing, and analytics.

## Functional Requirements

1. **Session Discovery** — Discover Gemini CLI sessions from `~/.gemini/tmp/<project_hash>/chats/session-<name>.json` files
2. **Session Parsing** — Parse Gemini's JSON session format (`[{role, parts}]` array) into the app's unified session stats (tokens, cost, duration, messages)
3. **Model Pricing** — Add pricing entries for all current Gemini models (gemini-3-pro-preview, gemini-3-flash-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite, gemini-2.0-flash, gemini-2.0-flash-lite)
4. **Model Tier Classification** — Extend `getModelTier()` to classify Gemini models (e.g., "gemini-pro", "gemini-flash" tiers or a unified "gemini" tier)
5. **Provider Detection** — Auto-detect Gemini sessions from `gemini-` model prefixes in `detectSessionProvider()`
6. **Session Provider Registry** — Register "gemini" in `lib/providers/session-registry.ts` with label, colors, badge classes, and model prefixes
7. **ConfigProvider Type** — Add `"gemini"` to `ConfigProvider` union type
8. **Configuration Management** — Read/write Gemini CLI's JSON config at `~/.gemini/settings.json` with typed `GeminiConfig` interface
9. **Instruction File Indexing** — Scan for `GEMINI.md` files (global at `~/.gemini/GEMINI.md`, project-level at `<project>/GEMINI.md` and `<project>/.gemini/GEMINI.md`)
10. **Path Categorization** — Extend `categorizeFilePath()` to recognize `GEMINI.md` as "instruction" and `/.gemini/` paths as "config"
11. **Google AI Adapter** — Create `GoogleAdapter` implementing `AIProviderAdapter` for the Gemini API (POST to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`)
12. **Settings API** — Extend `/api/settings` route to handle `?provider=gemini` with read/write of Gemini settings
13. **Settings Hook** — Create `useGeminiSettings()` React Query hook mirroring `useCodexSettings()`
14. **Analytics Integration** — Ensure Gemini sessions appear in analytics charts, provider breakdown, and filter bar with correct colors/labels
15. **Knowledge Docs** — Update all relevant knowledge docs (pricing, database patterns, etc.) to reflect Gemini support

## Non-Functional Requirements

- **Latency**: Session discovery should complete in <2s for typical user (~100 sessions)
- **Memory**: JSON sessions loaded one at a time, not all in memory simultaneously
- **Compatibility**: Must not break any existing Claude or Codex functionality (301 existing tests must continue passing)
- **Extensibility**: Follow the existing registry/strategy pattern — no new if/else chains

## Architectural Decisions

1. **Session format**: Gemini uses monolithic JSON (not JSONL). The adapter must read entire JSON files and convert to unified stats. This is fundamentally different from Claude/Codex JSONL streaming.
2. **Config format**: Gemini uses JSON (like Claude's approach), not TOML (like Codex). We can use standard `JSON.parse`/`JSON.stringify` — no need for a TOML library.
3. **Directory structure**: Gemini uses `~/.gemini/tmp/<sha256_hash>/chats/` with SHA-256 of project root path. Session files are `session-<name>.json`.
4. **Model tier**: Use a single "gemini" tier (not separate pro/flash tiers) to match the pattern used for Codex ("codex" tier, not separate "reasoning"/"gpt" tiers).
5. **Google AI Adapter**: Uses the Gemini API directly (`generativelanguage.googleapis.com`), not OpenAI-compatible format. Requires `GOOGLE_API_KEY` or stored key.
6. **Instruction file**: `GEMINI.md` — follows the same pattern as `CLAUDE.md` and `AGENTS.md`.

## Known Edge Cases

- Gemini sessions are JSON arrays, not JSONL — a malformed JSON file should be gracefully skipped, not crash the parser
- The `<project_hash>` in the path is SHA-256 — we need to compute it to map sessions back to projects (or just discover all sessions across all project hashes)
- Gemini's token usage may not be directly in the session JSON (it's in API responses during the session) — need to check if token counts are persisted
- Sessions may have tool calls embedded in `parts` with `functionCall` and `functionResponse` types
- The JSONL migration (#15292) may ship — adapter should handle both JSON and JSONL formats
- `gemini-2.0-flash` and `gemini-2.0-flash-lite` are being retired March 31, 2026 — still need pricing for historical sessions
- Settings merge: project `.gemini/settings.json` overrides global `~/.gemini/settings.json`

## Out of Scope

- Gemini CLI extension system (`gemini-extension.json`) — not relevant to session tracking
- Gemini CLI themes — UI customization is CLI-side only
- Gemini CLI hooks — these are CLI execution hooks, not velocity hooks
- WebSocket/real-time integration with Gemini CLI — same as Claude/Codex, we read log files
- Checkpoints (`~/.gemini/tmp/<hash>/checkpoints/`) — not needed for session analytics

## Open Questions Resolved

- **Q: What instruction file?** A: `GEMINI.md` (confirmed from docs)
- **Q: Config format?** A: JSON at `~/.gemini/settings.json`
- **Q: Session format?** A: Monolithic JSON array of `{role, parts}` turns (not JSONL yet)
- **Q: Which models?** A: gemini-3-pro/flash-preview, gemini-2.5-pro/flash/flash-lite, gemini-2.0-flash/flash-lite
- **Q: Google AI adapter?** A: Yes, user confirmed
- **Q: Scope?** A: Full parity with Claude/Codex support + knowledge docs updates
