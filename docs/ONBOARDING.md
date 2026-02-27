# Velocity — Developer Onboarding Guide

> A local dashboard for Claude Code power users: session analytics, multi-tab terminals, agent workflows, knowledge graphs, and a plugin marketplace.

---

## Quick Start (Day 1)

```bash
# 1. Clone
git clone <repo-url> && cd claude-best

# 2. Start dev server (launches Next.js on :3000 + WebSocket on :3001)
bun dev

# 3. Open in browser
open http://localhost:3000
```

`bun dev` bootstraps dependencies automatically and only installs when needed.

No database setup, no env vars, no external services. SQLite auto-initializes at `~/.claude/dashboard.db` on first request.

---

## Architecture at a Glance

```
Browser (React 19)                        Server (Node.js)
┌──────────────────────┐                 ┌──────────────────────┐
│  Next.js App Router  │  HTTP/REST      │  API Route Handlers  │
│  (pages + components)│◄───────────────►│  (app/api/**/route.ts│
│                      │                 │                      │
│  xterm.js terminals  │  WebSocket      │  WebSocket Server    │
│  @xyflow/react graphs│◄───────────────►│  PTY Manager         │
│                      │  (port 3001)    │  Session Watcher     │
│  React Query (server)│                 │                      │
│  Zustand (client)    │                 │  SQLite (better-     │
│  Dexie (IndexedDB)   │                 │  sqlite3) + fs       │
└──────────────────────┘                 └──────────────────────┘
```

**Key design decisions:**

- **Local-first** — All data stays on your machine (SQLite + filesystem)
- **Zero-config** — DB schema auto-migrates, no env vars needed for dev
- **Real-time** — WebSocket streams terminal output; file watcher detects session changes
- **Modular** — Each feature area has its own page, components, hooks, and API routes

---

## Tech Stack

| Layer        | Technology                       | Purpose                                    |
| ------------ | -------------------------------- | ------------------------------------------ |
| Framework    | Next.js 15 (App Router)          | Pages, API routes, SSR                     |
| UI           | Tailwind CSS + shadcn/ui + Radix | Styling and accessible components          |
| Server State | TanStack React Query             | Caching, refetching, mutations             |
| Client State | Zustand                          | Console layout, workspace, knowledge graph |
| Database     | better-sqlite3                   | Sessions, workflows, agents, analytics     |
| Browser DB   | Dexie (IndexedDB)                | Client-side persistence                    |
| Real-time    | ws (WebSocket)                   | Terminal streaming, live updates           |
| Terminals    | node-pty + xterm.js              | Spawn shells, render in browser            |
| Graphs       | @xyflow/react + dagre            | Workflow canvas, knowledge graph           |
| Charts       | recharts                         | Cost/usage analytics                       |
| Code Editor  | CodeMirror 6                     | Instruction/prompt editing                 |
| Testing      | Vitest                           | Unit/integration tests                     |
| Icons        | lucide-react                     | Consistent icon set                        |

---

## Directory Map

```
app/                          # Next.js pages + API routes
├── page.tsx                  # Home dashboard
├── console/                  # Multi-tab terminal UI
├── agents/                   # Agent builder
├── workflows/                # Workflow canvas
├── knowledge/                # Knowledge graph
├── marketplace/              # Plugin store
├── analytics/                # Usage/cost analytics
├── sessions/                 # Session history
├── settings/                 # Configuration
├── skills/                   # Skill library
├── mcp/                      # MCP server management
├── providers/                # LLM provider config
├── commands/                 # Command registry
├── usage/                    # Usage dashboard
└── api/                      # ~91 API route handlers

components/                   # React components by feature
├── console/                  # Terminal panes, sidebar, toolbar
├── agents/                   # Agent builder, editor, workspace
├── workflows/                # Workflow builder, node editor
├── knowledge/                # Graph canvas, nodes, sidebar
├── marketplace/              # Package cards, search, sources
├── sessions/                 # Message list, filters
├── settings/                 # Hooks, MCP, permissions tabs
├── analytics/ + usage/       # Charts, breakdowns
├── layout/                   # Header, sidebar, error boundary
├── library/                  # Skill/knowledge editors
├── tools/                    # MCP/plugin management
└── ui/                       # Shared primitives (shadcn/ui)

hooks/                        # ~30 custom React hooks
├── useMultiConsole.ts        # Multi-tab terminal orchestration
├── useAgents.ts              # Agent CRUD
├── useWorkflows.ts           # Workflow management
├── useAnalytics.ts           # Cost/usage data
├── useKnowledgeGraph.ts      # Graph operations
├── useMarketplace.ts         # Plugin install/search
├── useSkills.ts              # Skill management
├── useSettings.ts            # Configuration
└── useKeyboardShortcuts.ts   # Global shortcuts

lib/                          # Core business logic
├── db/                       # SQLite schema, queries, migrations
│   ├── schema.ts             # Table definitions (auto-migrates)
│   ├── index.ts              # DB connection singleton
│   ├── workflows.ts          # Workflow CRUD
│   └── knowledge-graph.ts    # Graph persistence
├── cost/                     # Pricing rates, cost calculations
├── parser/                   # JSONL session parsing, aggregation
├── marketplace/              # Plugin discovery, README parsing
├── knowledge/                # Graph builder, scanner
├── workflows/                # Command prompts, layout
├── agents/                   # Agent parsing, utilities
├── instructions/             # AI editor, indexer
├── hooks/                    # Hook matcher
├── safety/                   # Safety limits
├── claude-paths.ts           # ~/.claude/* path constants
├── claude-settings.ts        # Read/write Claude settings.json
└── logger.ts                 # Structured logging

server/                       # WebSocket + PTY server
├── ws-server.ts              # WebSocket server (port 3001)
├── pty-manager.ts            # Spawn/resize/kill terminals
├── watcher.ts                # File system watcher for sessions
└── handlers/
    ├── console-handler.ts    # Console WebSocket messages
    ├── pty-handler.ts        # Terminal I/O messages
    └── utility-handler.ts    # Utility messages

stores/                       # Zustand state stores
├── consoleLayoutStore.ts     # Pane tree, focus, active terminal
├── workspaceStore.ts         # Canvas selection, agent/workflow state
├── workflowCreationStore.ts  # Workflow wizard state
├── knowledgeStore.ts         # Graph selection/interaction
└── liveStore.ts              # Live streaming data

types/                        # TypeScript type definitions
├── console.ts                # ConsoleSession, TerminalMeta
├── session.ts                # Session, Message, ToolCall
├── workflow.ts               # Workflow, WorkflowNode, WorkflowEdge
├── agent.ts                  # Agent, AgentConfig
├── knowledge-graph.ts        # KnowledgeNode, KnowledgeEdge
├── marketplace.ts            # MarketplaceItem, InstallConfig
└── ...                       # + instructions, memory, scope, etc.
```

---

## Feature Areas (How Things Connect)

Each feature has a page, components, hooks, and API routes that work together.

### Console (Real-time Terminal)

The flagship feature — a multi-tab, tiling terminal that spawns Claude CLI sessions.

```
User clicks "New Session"
  → useConsoleLauncher() hook
  → POST /api/console-sessions
  → WebSocket → PtyManager.spawn()
  → PTY stdout streams back via WebSocket
  → xterm.js renders output in browser
```

| Piece      | File(s)                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| Page       | `app/console/page.tsx`                                                    |
| Components | `components/console/*` (ClaudePanel, ConsoleSidebar, LayoutToolbar, etc.) |
| Hooks      | `useMultiConsole`, `useConsoleLauncher`, `useSessionContext`              |
| Store      | `stores/consoleLayoutStore.ts`                                            |
| Server     | `server/pty-manager.ts`, `server/handlers/console-handler.ts`             |
| API        | `app/api/console-sessions/route.ts`                                       |

### Agents & Workflows

Build and orchestrate multi-step AI agent workflows with a visual canvas.

| Piece      | File(s)                                                                          |
| ---------- | -------------------------------------------------------------------------------- |
| Pages      | `app/agents/page.tsx`, `app/workflows/page.tsx`                                  |
| Components | `components/agents/*`, `components/workflows/*`, `components/agents/workspace/*` |
| Hooks      | `useAgents`, `useAgentBuilderChat`, `useAgentLaunch`, `useWorkflows`             |
| Store      | `stores/workspaceStore.ts`, `stores/workflowCreationStore.ts`                    |
| Lib        | `lib/agents/*`, `lib/workflows/*`, `lib/db/workflows.ts`                         |
| API        | `app/api/agents/*`, `app/api/workflows/*`                                        |

### Marketplace

Plugin discovery, install, and management for skills, MCP servers, hooks, and agents.

| Piece      | File(s)                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| Page       | `app/marketplace/page.tsx`                                                    |
| Components | `components/marketplace/*` (PackageCard, PluginDetailDialog, SourcesDialog)   |
| Hook       | `useMarketplace`                                                              |
| Lib        | `lib/marketplace/*` (readme-parser, repo-tree, fetch-utils, builtin-hooks)    |
| API        | `app/api/marketplace/search/route.ts`, `app/api/marketplace/install/route.ts` |

### Analytics

Cost tracking, token usage, tool analytics, and model breakdowns.

| Piece      | File(s)                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| Pages      | `app/analytics/page.tsx`, `app/usage/page.tsx`                          |
| Components | `components/usage/*` (BlockUsageCard, WeekUsageCard, ToolAnalyticsCard) |
| Hook       | `useAnalytics`, `useSystemStats`                                        |
| Lib        | `lib/cost/pricing.ts`, `lib/parser/*`, `lib/claude/usage-fetcher.ts`    |
| API        | `app/api/analytics/*`                                                   |

### Knowledge Graph

Visual graph of project instructions, CLAUDE.md files, and their relationships.

| Piece      | File(s)                                                              |
| ---------- | -------------------------------------------------------------------- |
| Page       | `app/knowledge/page.tsx`                                             |
| Components | `components/knowledge/*` (KnowledgeCanvas, nodes/, KnowledgeSidebar) |
| Hook       | `useKnowledgeGraph`                                                  |
| Store      | `stores/knowledgeStore.ts`                                           |
| Lib        | `lib/knowledge/graph-builder.ts`, `lib/knowledge/scanner.ts`         |
| API        | `app/api/knowledge/*`                                                |

---

## Development Patterns

### API Routes

All API routes are Next.js Route Handlers in `app/api/**/route.ts`:

```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM table").all();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  // ... validate, persist, return
  return NextResponse.json({ success: true });
}
```

### React Query + Hooks

Server state is managed via React Query in custom hooks:

```typescript
// hooks/useExample.ts
export function useExample() {
  const query = useQuery({
    queryKey: ["example"],
    queryFn: () => fetch("/api/example").then((r) => r.json()),
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      fetch("/api/example", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["example"] }),
  });

  return { ...query, create: mutation.mutate };
}
```

### Zustand Stores

Client-side UI state persisted to IndexedDB:

```typescript
// stores/exampleStore.ts
import { create } from "zustand";

interface ExampleState {
  selectedId: string | null;
  setSelected: (id: string | null) => void;
}

export const useExampleStore = create<ExampleState>((set) => ({
  selectedId: null,
  setSelected: (id) => set({ selectedId: id }),
}));
```

### Database Access

SQLite via `better-sqlite3` — synchronous, no ORM:

```typescript
import { getDb } from "@/lib/db";

const db = getDb();
// Schema auto-creates tables in lib/db/schema.ts
const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
```

### WebSocket Messages

Typed messages between browser and server:

```typescript
// Send from browser
ws.send(JSON.stringify({ type: "pty:input", sessionId, data: "ls\n" }));

// Handle on server (server/handlers/pty-handler.ts)
handleMessage(ws, { type: "pty:input", sessionId, data }) {
  this.ptyManager.write(sessionId, data);
}
```

---

## Key Files to Read First

These files will give you the most context for understanding the system:

| Priority | File                                    | Why                                      |
| -------- | --------------------------------------- | ---------------------------------------- |
| 1        | `CLAUDE.md`                             | Project conventions and guidelines       |
| 2        | `lib/db/schema.ts`                      | Database tables — the data model         |
| 3        | `types/console.ts` + `types/session.ts` | Core domain types                        |
| 4        | `server/ws-server.ts`                   | WebSocket server — how real-time works   |
| 5        | `server/pty-manager.ts`                 | Terminal spawning — the core capability  |
| 6        | `hooks/useMultiConsole.ts`              | How the console UI orchestrates sessions |
| 7        | `lib/cost/pricing.ts`                   | Model pricing — drives analytics         |
| 8        | `lib/claude-paths.ts`                   | Where Claude files live on disk          |
| 9        | `lib/claude-settings.ts`                | How settings are read/written            |
| 10       | `stores/consoleLayoutStore.ts`          | Console layout state machine             |

---

## Common Tasks

### Add a new API route

1. Create `app/api/your-feature/route.ts`
2. Export `GET`, `POST`, `PUT`, or `DELETE` handlers
3. Use `getDb()` for database access
4. Return `NextResponse.json(...)` responses

### Add a new page

1. Create `app/your-page/page.tsx`
2. Add navigation link in `components/layout/Sidebar.tsx`
3. Create components in `components/your-feature/`
4. Create a hook in `hooks/useYourFeature.ts` for data fetching

### Add a new database table

1. Add `CREATE TABLE IF NOT EXISTS` to `lib/db/schema.ts`
2. The table auto-creates on next server restart
3. Add query functions in `lib/db/your-table.ts`

### Install a marketplace plugin

The install pipeline (in `app/api/marketplace/install/route.ts`) tries these strategies in order:

1. **Explicit installConfig** — pre-populated from frontend
2. **README parsing** — fetches README, extracts MCP install commands
3. **BFS tree discovery** — walks repo tree for agents/skills/MCP configs
4. **Legacy fallback** — `package.json` → `npx -y`, SKILL.md → skill install

### Run tests

```bash
bun test                    # Run all tests
bun test -- --watch         # Watch mode
bun test <file>             # Run specific test file
```

### Lint and type-check

```bash
bun run lint                # ESLint + TypeScript checking
```

---

## WebSocket Server Lifecycle

The WebSocket server starts automatically via Next.js instrumentation:

```
bun dev
  → Next.js starts
  → instrumentation.ts runs (Node.js runtime)
  → Creates WebSocketServer on port 3001
  → Creates SessionWatcher (monitors JSONL logs)
  → Browser connects via useMultiConsole hook
```

**Message flow:**

```
Browser → WebSocket → Handler Router → {
  "console:*"  → ConsoleHandler
  "pty:*"      → PtyHandler  → PtyManager
  "utility:*"  → UtilityHandler
}
```

---

## Data Flow: Session Lifecycle

Understanding how a Claude session flows through the system:

```
1. User starts session in Console
   → PtyManager spawns `claude` CLI process
   → Claude writes JSONL logs to ~/.claude/projects/*/sessions/

2. SessionWatcher detects new/changed JSONL files
   → Broadcasts "session:update" via WebSocket

3. Parser (lib/parser/) reads JSONL
   → Extracts messages, tool calls, token counts
   → Aggregates cost using lib/cost/pricing.ts

4. Data persisted to SQLite (sessions table)
   → Available via /api/sessions/* routes
   → React Query fetches and caches in browser

5. Analytics derived from session data
   → Tool usage, model breakdown, cost trends
   → Displayed via recharts in analytics pages
```

---

## Environment & Config

| Item             | Details                                                  |
| ---------------- | -------------------------------------------------------- |
| Node version     | 18+ (uses `node-pty` native module)                      |
| Package manager  | `bun` (not npm/pnpm)                                     |
| Dev server       | `bun dev` → localhost:3000 (Next.js) + :3001 (WebSocket) |
| Database         | `~/.claude/dashboard.db` (auto-created)                  |
| Claude config    | `~/.claude/settings.json` (MCP servers, hooks, etc.)     |
| Skills directory | `~/.claude/skills/`                                      |
| Agents directory | `~/.claude/agents/`                                      |
| Session logs     | `~/.claude/projects/*/sessions/*.jsonl`                  |

### Optional environment variables

```bash
GITHUB_TOKEN=...       # Higher GitHub API rate limits for marketplace
PORT=3000              # Next.js port (default: 3000)
```

---

## Conventions Reference

- **Use `bun`** for all commands (not npm/pnpm)
- **API routes** are Next.js Route Handlers (`app/api/**/route.ts`)
- **Console components** go in `components/console/`
- **Cost calculations** go through `lib/cost/pricing.ts`
- **WebSocket messages** are typed in `types/console.ts`
- **All paginated tables** must use `components/ui/table-pagination.tsx`
- **Icons** come from `lucide-react`
- **Graphs** use `@xyflow/react`
- **State rule**: React Query for server state, Zustand for client UI state

---

## 30/60/90 Day Milestones

### Day 1-7: Foundation

- [ ] Clone repo, run `bun dev`, explore the UI
- [ ] Read this guide and `CLAUDE.md`
- [ ] Read `lib/db/schema.ts` to understand the data model
- [ ] Read `types/console.ts` + `types/session.ts`
- [ ] Open the Console page, launch a terminal session
- [ ] Trace a request from browser → API route → database
- [ ] Run `bun test` — all tests should pass

### Day 8-30: Immersion

- [ ] Fix a bug or implement a small feature
- [ ] Read through one complete feature area (console or marketplace)
- [ ] Understand the WebSocket ↔ PTY pipeline
- [ ] Submit first PR with tests
- [ ] Participate in code reviews

### Day 31-60: Contribution

- [ ] Own a small feature end-to-end
- [ ] Add a new API route + hook + component
- [ ] Contribute to marketplace or knowledge graph
- [ ] Write documentation for something you found confusing

### Day 61-90: Integration

- [ ] Lead a feature independently
- [ ] Propose architecture improvements
- [ ] Mentor newer contributors
- [ ] Contribute to test coverage
