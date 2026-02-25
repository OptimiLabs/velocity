# Velocity

Velocity is a local dashboard for Claude Code, Codex CLI, and Gemini CLI.
Run sessions, understand usage/cost, and build reusable automation from one place.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Built with Bun](https://img.shields.io/badge/Built_with-Bun-f9f1e1.svg)](https://bun.sh)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

![Velocity Dashboard](docs/screenshots/dashboard.png)

## Start in 60 Seconds

```bash
git clone https://github.com/OptimiLabs/velocity.git
cd velocity
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

If `bun` is not installed yet, install it from [bun.sh](https://bun.sh) and run the same commands.

## New Here? Read This First

Velocity is easiest to understand as a 3-step loop:

1. Run work in **Console** (Claude/Codex/Gemini CLI sessions).
2. Review what happened in **Sessions**, **Review**, **Analytics**, and **Usage**.
3. Save repeatable work as **Agents**, **Workflows**, **Skills**, and **Commands**.

## Why Velocity

- **100% local** — No cloud, no accounts, no telemetry. Your data stays on your machine.
- **Zero config** — `bun install && bun dev`. SQLite database auto-creates on first run.
- **Built for Claude Code, Codex CLI, and Gemini CLI** — Parses local logs, normalizes usage analytics, and manages provider-scoped workflows/config.

## What Velocity Does

Velocity is split into three layers in the sidebar: `Workspace`, `Build`, and `Platform`.

| Area | What you can do |
| ---- | ---------------- |
| Console | Run local CLI sessions in multi-tab PTYs with tiling, grouping, env injection, and command palette support. |
| Sessions | Browse indexed local sessions by provider/project, inspect metadata, and compare runs over time. |
| Review | Open an AI-assisted review workspace to compare selected sessions and keep a review history. |
| Analytics | Track cost/tokens/latency/tool usage by day, project, model, role, and provider. |
| Usage | Monitor spend and token consumption in block/week/month views with model and session breakdowns. |
| Agents | Create and edit reusable agent definitions, set prompts/tools/model choices, and sort by usage/cost. |
| Workflows | Build multi-step graph workflows (manual or AI-assisted), then save/deploy as provider-native artifacts. |
| Skills | Create/import/archive skills, manage scope (global/project/plugin), and edit reusable instruction packs. |
| Commands | Explore built-in CLI commands plus provider-scoped custom workflow/skill commands and metadata. |
| Hooks | Manage hook rules and events for supported providers with templates + AI assist where available. |
| MCP Servers | Add/edit/remove MCP servers, inspect discovered tools, and review usage/connectivity data. |
| Routing | Visualize routing/entrypoint graph relationships across your local codebase. |
| Models | Compare model pricing, benchmarks, and provider capability snapshots. |
| Plugins | Manage Claude-scope plugins and bundled plugin skills. |
| Marketplace | Discover/install agents, skills, hooks, MCP servers, and bundled packages from GitHub-backed sources. |
| Settings | Configure core preferences plus Claude/Codex/Gemini provider-specific defaults and behavior. |

See detailed module docs in [`docs/features/`](docs/features/).

## Provider Scope Notes

- Velocity is provider-scoped across `Claude`, `Codex`, and `Gemini` for sessions, analytics, usage, agents, workflows, skills, commands, marketplace installs, and most settings.
- Hooks are available for Claude and Gemini scopes; Codex scope does not expose hooks.
- Plugins are Claude scope only.
- Workflow/skill invocation differs by provider:
  - Claude: `/<name>`
  - Codex: `/skills` picker or `$<name>`
  - Gemini: `/<name>` (via generated Gemini command artifact)

## Typical End-to-End Flows

1. Run sessions in **Console** (or ingest existing local logs).
2. Inspect results in **Sessions**, **Review**, **Analytics**, and **Usage**.
3. Build reusable automation in **Agents**, **Workflows**, **Skills**, **Commands**, and **Hooks**.
4. Connect external tools via **MCP Servers**, **Plugins**, and **Marketplace** installs.
5. Tune behavior in **Routing**, **Models**, and **Settings**.

## Quick Start (Detailed)

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

## Performance and Resource Guardrails

Velocity includes hard limits and throttling so long-running sessions do not
cause runaway CPU or memory usage.

- **PTY output coalescing:** Output chunks are batched and flushed per animation frame.
- **Background activity throttling:** Hidden terminal `hasActivity`/`lastOutputAt` writes are throttled.
- **Offline PTY buffer limits:** `256KB` per terminal, `8MB` total globally with oldest-buffer eviction.
- **Serialized scrollback limits:** `512KB` per terminal, max `30` terminals, and `6MB` total serialized memory.
- **Terminal DOM cache limits:** Max `16` cached terminal instances, with eviction and cleanup.
- **Layout update guards:** Pane resize/focus updates are no-op guarded and batched to avoid render thrash.

## Architecture

| Layer        | Tech                                                   |
| ------------ | ------------------------------------------------------ |
| Framework    | Next.js 16 (App Router)                                |
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
