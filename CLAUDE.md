# velocity — Project Guidelines

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: Tailwind CSS + shadcn/ui + Radix primitives
- **State**: TanStack React Query for server state, Zustand stores for client state
- **DB**: better-sqlite3 (server-side), Dexie (client-side IndexedDB)
- **Real-time**: WebSocket server (`server/ws-server.ts`) + custom hooks
- **Testing**: Vitest (`bun test`)
- **Icons**: lucide-react
- **Graphs**: @xyflow/react

## Key Architecture

- `app/` — Next.js pages and API routes
- `components/` — React components organized by feature (console/, sessions/, analytics/, agents/, layout/)
- `hooks/` — Custom React hooks (useMultiConsole, useSessions, useAnalytics, etc.)
- `lib/` — Core logic: DB schema, JSONL parser, cost calculator, safety limits
- `server/` — WebSocket server, PTY manager, console handler
- `stores/` — Zustand stores for console layout and swarm state
- `types/` — TypeScript type definitions

## Conventions

- Console UI components go in `components/console/`
- API routes use Next.js Route Handlers (`app/api/`)
- WebSocket messages are typed in `types/console.ts`
- Cost calculations go through `lib/cost/calculator.ts` with pricing in `lib/cost/pricing.ts`
- Session parsing: `lib/parser/jsonl.ts` parses Claude JSONL logs, `lib/parser/session-aggregator.ts` aggregates stats

## Tables

- All paginated tables must use `components/ui/table-pagination.tsx` — provides prev/next buttons and a direct page number input
- Never use a plain prev/next-only pagination; users must be able to jump to a specific page by typing a number
