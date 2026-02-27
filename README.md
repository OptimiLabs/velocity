# Velocity

Velocity is a local-first command center for Claude Code, Codex CLI, and Gemini CLI.
It helps you run sessions, understand what happened, and turn repeated work into reliable workflows.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Built with Bun](https://img.shields.io/badge/Built_with-Bun-f9f1e1.svg)](https://bun.sh)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)

## Why Velocity

Most CLI-only workflows break down as your team scales:

- session context is fragmented
- routing/entrypoint behavior is opaque
- reusable flows stay tribal knowledge

Velocity addresses this with three core loops:

1. **Run** work in local CLI sessions.
2. **Inspect** usage, cost, latency, tools, and routing context.
3. **Reuse** what works as agents, workflows, skills, and commands.

## Preview

These GIFs are embedded directly in the README and render on GitHub.

### Workflow Builder
AI Assist setup -> finished workflow canvas -> AI prompt review -> node prompt editing.
![Workflow Builder Demo](docs/assets/demo/workflows-demo.gif)

### Routing Graph
Fullscreen routing deep-dive with readable node zoom and multi-node inspection.
![Routing Demo](docs/assets/demo/routing-demo.gif)

### Sessions Journey
Console -> Sessions -> Session Detail walkthrough with transcript filters and scrolling.
![Sessions Journey Demo](docs/assets/demo/sessions-demo.gif)

### Review Compare
Two-session review workspace with compare scope and analysis controls.
![Review Compare Demo](docs/assets/demo/review-compare-demo.gif)

### Back-to-Back Reel
All demos played continuously.
![Back-to-Back Demo Reel](docs/assets/demo/demo-back-to-back.gif)

### Stitched Reel
Continuous reel with short holds between each section.
![Stitched Demo Reel](docs/assets/demo/demo-stitched.gif)

Regenerate all demos:

```bash
python3 scripts/demo/capture-demos.py --base-url http://127.0.0.1:3000 --provider claude --target-seconds 12
```

## Start in 60 Seconds

```bash
git clone https://github.com/OptimiLabs/velocity.git
cd velocity
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Workflow-First Mental Model

If you only learn one thing, learn this:

1. Use **Console** and **Sessions** to capture real work.
2. Convert proven patterns into **Agents** and **Workflows**.
3. Use **Routing** and **Analytics** to validate that automation is actually correct and cost-efficient.

## Feature Inventory

Velocity is organized into three layers:

| Layer | Purpose | Key surfaces |
| --- | --- | --- |
| Workspace | Run and inspect | Console, Sessions, Review, Analytics, Usage |
| Build | Reuse and automate | Agents, Workflows, Skills, Commands, Hooks, MCP, Routing |
| Platform | Configure and extend | Models, Plugins, Marketplace, Settings |

Detailed inventory: [docs/guides/functionality-inventory.md](docs/guides/functionality-inventory.md)

## Provider Parity

| Capability | Claude | Codex | Gemini |
| --- | --- | --- | --- |
| Sessions + analytics ingestion | Yes | Yes | Yes |
| Agents (global + project scope) | Yes | Yes | Yes |
| Workflows | Yes | Yes | Yes |
| Skills + commands | Yes | Yes | Yes |
| Routing graph | Yes | Yes | Yes |
| Hooks | Yes | No | Yes |
| Plugins | Yes | No | No |

## Core Tech

| Layer | Stack |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| Runtime / PM | Bun |
| DB | SQLite (`better-sqlite3`) |
| State | TanStack Query + Zustand |
| Real-time | WebSocket + PTY manager |
| Graph UI | `@xyflow/react` |
| Tests | Vitest |

## Docs

- Feature docs: [`docs/features/`](docs/features/)
- Install + config guides: [`docs/guides/`](docs/guides/)
- Provider matrix: [`docs/guides/provider-capability-matrix.md`](docs/guides/provider-capability-matrix.md)

## Troubleshooting

### `better-sqlite3` binding errors

Reinstall with Bun:

```bash
rm -rf node_modules
bun install
```

### Console terminal blank / stuck

1. Verify `bun dev` starts without PTY errors.
2. Hard refresh browser.
3. Clear persisted local layout state.

## Security

Velocity is local-first. Data stays on your machine by default.
Optional remote calls are limited to explicit user-driven actions (for example marketplace sources).

See [SECURITY.md](SECURITY.md) for reporting and policy details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and PR workflow.
