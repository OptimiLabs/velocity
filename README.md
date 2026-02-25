# Velocity

Local-first workspace for Claude Code, Codex CLI, and Gemini CLI. Inspect sessions, track costs, manage tools/skills, and run workflow automation from one dashboard.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Built with Bun](https://img.shields.io/badge/Built_with-Bun-f9f1e1.svg)](https://bun.sh)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

![Velocity Dashboard](docs/screenshots/dashboard.png)

## Why Velocity

- **100% local** — No cloud, no accounts, no telemetry. Your data stays on your machine.
- **Zero config** — `bun install && bun dev`. SQLite database auto-creates on first run.
- **Built for Claude Code, Codex CLI, and Gemini CLI** — Parses local logs, normalizes usage analytics, and manages provider-scoped workflows/config.

## Features

| Feature     | Status | Description                                                                       |
| ----------- | ------ | --------------------------------------------------------------------------------- |
| Console     | Beta   | Multi-tab PTY terminal for running CLI sessions with real-time output              |
| Analytics   | Stable | Cost tracking, token usage breakdowns, tool frequency, and session-level insights |
| Usage       | Stable | Block-based usage monitoring with weekly and monthly views                        |
| Workflows   | Stable | Visual canvas builder for provider-scoped, multi-step agent orchestration          |
| Agents      | Stable | AI-powered agent builder with configurable roles, models, and tool access         |
| MCP Servers | Stable | MCP server management — add, configure, and monitor servers                       |
| Settings    | Stable | Configuration hub for Claude/Codex/Gemini settings, API keys, and app preferences |
| Skills      | Stable | Skill library for creating, editing, and organizing reusable instruction packs     |
| Marketplace | Beta   | Plugin discovery and installation (GitHub search reliability varies)              |
| Hook AI Gen | Beta   | AI-generated Git hook configurations (output quality varies, always review)       |

> **Beta** features are functional but have known rough edges. See [feature docs](docs/features/) for details.

## Quick Start

```bash
git clone https://github.com/OptimiLabs/velocity.git
cd velocity
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000). That's it — no database setup, no environment variables, no external services.

## Prerequisites

- [Bun](https://bun.sh) 1.0+ (used as package manager and runtime)
- [Node.js](https://nodejs.org) 18+ (required by Next.js)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (optional)
- [OpenAI Codex CLI](https://developers.openai.com/codex/) (optional)
- [Gemini CLI](https://geminicli.com/docs/) (optional)

### Installing Bun

If you don't have Bun installed, run one of the following:

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"

# Homebrew (macOS)
brew install oven-sh/bun/bun
```

After installing, restart your terminal and verify with `bun --version`.

### Troubleshooting: `better-sqlite3` bindings error

If you see an error like `could not locate the bindings file` referencing `.pnpm/better-sqlite3`, it means dependencies were installed with npm or pnpm instead of Bun. The native `better-sqlite3` module must be compiled for the correct runtime.

**Fix:**

```bash
# Remove existing node_modules and reinstall with Bun
rm -rf node_modules
bun install
```

> **Important:** Always use `bun install` — not `npm install` or `pnpm install`. Velocity uses Bun as both its package manager and runtime, and native modules like `better-sqlite3` must be built for it.

### Troubleshooting: Console terminals are blank / unresponsive

If the Console terminals show a black area but don't respond to input:

1. **Check the WebSocket server started.** Look for this line in `bun dev` output:
   ```
   WebSocket server + watchers started via instrumentation
   ```
   If you see `failed to start WebSocket server` instead, check that `node-pty` loads:
   ```bash
   node -e "require('node-pty')"
   ```

2. **Hard-refresh the browser** (`Cmd+Shift+R` / `Ctrl+Shift+R`) to clear cached state.

3. **Clear persisted layout state.** Open browser DevTools → Application → Local Storage → `localhost:3000` → delete the `console-layout-store` key, then refresh.

4. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules
   bun install
   bun dev
   ```

## Architecture

| Layer        | Tech                                                   |
| ------------ | ------------------------------------------------------ |
| Framework    | Next.js 15 (App Router)                                |
| UI           | Tailwind CSS + shadcn/ui + Radix primitives            |
| Server state | TanStack React Query                                   |
| Client state | Zustand                                                |
| Database     | SQLite (better-sqlite3) — auto-created on first run    |
| Client DB    | Dexie (IndexedDB) — for browser-side persistence       |
| Real-time    | WebSocket server (starts automatically with `bun dev`) |
| Testing      | Vitest                                                 |
| Icons        | lucide-react                                           |
| Graphs       | @xyflow/react                                          |

## Scripts

| Command          | Description                         |
| ---------------- | ----------------------------------- |
| `bun dev`        | Start dev server + WebSocket server |
| `bun build`      | Production build                    |
| `bun test`       | Run tests (Vitest)                  |
| `bun test:watch` | Run tests in watch mode             |
| `bun lint`       | Lint with ESLint                    |

## Project Structure

```
app/            → Pages and API routes (Next.js App Router)
components/     → React components organized by feature
  console/      → Terminal and console UI
  sessions/     → Session browser and detail views
  analytics/    → Charts, cost breakdowns, usage stats
  agents/       → Agent builder and management
  layout/       → Sidebar, navigation, shared layout
  ui/           → shadcn/ui primitives and custom components
hooks/          → Custom React hooks (useMultiConsole, useSessions, useAnalytics, etc.)
lib/            → Core logic
  cost/         → Cost calculator and pricing tables
  db/           → SQLite schema, migrations, queries
  parser/       → JSONL session log parser and aggregator
server/         → WebSocket server, PTY manager, console handler
stores/         → Zustand stores (console layout, swarm state)
types/          → TypeScript type definitions
docs/           → Documentation and feature guides
```

## Security

Velocity is a **local-only** application. It does not make network requests beyond `localhost` (except for optional GitHub API calls in the Marketplace).

**Important notes:**

- API keys are stored with base64 encoding, **not encryption**. Do not share your SQLite database file.
- The WebSocket server binds to `localhost:3001` only — it is not accessible from other machines.
- Session data is read from local provider directories (`~/.claude/`, `~/.codex/`, `~/.gemini/`).

See [SECURITY.md](SECURITY.md) for full details and known limitations.

## Configuration

All configuration is optional. Velocity works out of the box with zero setup.

| Variable       | Purpose                                                | Default                         |
| -------------- | ------------------------------------------------------ | ------------------------------- |
| `GITHUB_TOKEN` | Higher rate limits for Marketplace GitHub API searches | None (uses unauthenticated API) |
| `PORT`         | Override the Next.js dev server port                   | `3000`                          |

## Roadmap

- Improve Codex/Gemini config and extension parity with upstream CLI changes
- Generate better AI hook implementations
- Integrate Claude setup and agent generation
- Improve agent-to-agent communication
- Improve token usage tracking and ways to reduce token consumption
- Add Kimi 2.5 and GLM model support
- Improve UI customization and theming options

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Setting up your development environment
- Code standards and conventions
- Submitting pull requests

Interested in collaborating? Reach out at **jaewonlee9642@gmail.com** or open an issue.

Please note that this project follows a [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[GNU AGPL v3.0 or later](LICENSE) — jaewon42
