# Contributing to Velocity

Thank you for your interest in contributing to Velocity! This guide will help you get set up and familiar with our development workflow.

## Getting Started

1. **Install Bun** (if not already installed)

   ```bash
   # macOS / Linux
   curl -fsSL https://bun.sh/install | bash

   # Windows
   powershell -c "irm bun.sh/install.ps1 | iex"

   # Homebrew (macOS)
   brew install oven-sh/bun/bun
   ```

   Restart your terminal after installing, then verify with `bun --version`.

2. **Clone the repository**

   ```bash
   git clone https://github.com/OptimiLabs/velocity.git
   cd velocity
   ```

3. **Install dependencies**

   ```bash
   bun install
   ```

4. **Start the development server**

   ```bash
   bun dev
   ```

   This starts the Next.js dev server. The app will be available at `http://localhost:3000`.

5. **Verify Console works** — After `bun dev` starts, check that you see `WebSocket server + watchers started` in the terminal output. If Console terminals are blank, see the troubleshooting section in the README.

## Development Workflow

### Branching

- Always branch from `main`.
- Use descriptive branch names: `feat/session-export`, `fix/cost-calculation-rounding`, `docs/api-reference`.

### Commit Messages

We use **conventional commits**. Every commit message must start with a type prefix:

| Prefix   | Use for                             |
| -------- | ----------------------------------- |
| `feat:`  | New features or capabilities        |
| `fix:`   | Bug fixes                           |
| `docs:`  | Documentation-only changes          |
| `chore:` | Dependency updates, config, tooling |
| `ci:`    | CI/CD pipeline changes              |

Examples:

```
feat: add session export to CSV
fix: correct token count in cost calculator
docs: update API route examples in CONTRIBUTING
chore: bump @xyflow/react to 12.4.0
ci: add type-check step to PR workflow
```

### Pull Request Process

1. Create your feature branch from `main`.
2. Make your changes with conventional commits.
3. Run linting, type-checking, and tests before pushing (see [Testing](#testing)).
4. Open a pull request against `main`.
5. Fill in the PR template describing what changed and why.
6. Address any review feedback.

## Code Standards

### Package Manager

Use **`bun`** for all commands. Do not use `npm` or `pnpm`.

```bash
bun install        # install deps
bun add <pkg>      # add a dependency
bun test           # run tests
```

### State Management

- **Server state** (API data, sessions, analytics): use **TanStack React Query**.
- **Client state** (UI state, layout, local preferences): use **Zustand** stores.
- Avoid mixing the two. If data comes from an API or file system, it belongs in React Query. If it is purely UI-driven, it belongs in Zustand.

### UI Components

- Use **shadcn/ui** components and **Radix** primitives as the foundation.
- Icons come from **lucide-react**.
- Styling uses **Tailwind CSS**. Use the `cn()` utility for conditional class merging.

### Table Pagination

All paginated tables **must** use `components/ui/table-pagination.tsx`. This component provides prev/next buttons **and** a direct page number input. Do not implement plain prev/next-only pagination.

## Project Structure

```
app/            Next.js pages and API route handlers
components/     React components organized by feature
  console/        Terminal console UI
  sessions/       Session list and detail views
  analytics/      Charts and dashboards
  agents/         Agent builder and management
  layout/         Shell, sidebar, navigation
hooks/          Custom React hooks
lib/            Core logic
  db/             SQLite schema and queries
  parser/         JSONL parsing and session aggregation
  cost/           Cost calculator and pricing data
server/         WebSocket server, PTY manager
stores/         Zustand stores
types/          TypeScript type definitions
```

## Testing

We use **Vitest** as the test runner, invoked through Bun.

```bash
bun test          # run all tests once
bun test:watch    # run tests in watch mode
```

### Test File Location

Test files live in `__tests__/` directories that mirror the source structure. For example:

```
lib/cost/calculator.ts        ->  __tests__/lib/cost/calculator.test.ts
components/sessions/List.tsx  ->  __tests__/components/sessions/List.test.tsx
hooks/useAnalytics.ts         ->  __tests__/hooks/useAnalytics.test.ts
```

### Before Submitting

Always run the following before pushing:

```bash
bun test
```

Ensure there are no lint errors or type-check failures.

## Adding Features

### New Page

1. Create a directory under `app/` following Next.js App Router conventions.
2. Add a `page.tsx` for the route and `layout.tsx` if the page needs a custom layout.
3. Use server components by default; add `"use client"` only when client interactivity is required.

### New API Route

1. Create a `route.ts` file under `app/api/<resource>/`.
2. Export named functions for each HTTP method (`GET`, `POST`, `PUT`, `DELETE`).
3. Return `NextResponse.json()` with appropriate status codes.
4. Keep business logic in `lib/` and call it from the route handler.

### New Component

1. Place the component in the appropriate feature directory under `components/`.
2. If it is a general-purpose UI primitive, place it in `components/ui/`.
3. Co-locate component-specific types in the same file or in `types/`.

## Bug Reports & Feature Requests

Please open an issue on GitHub:

**https://github.com/OptimiLabs/velocity/issues**

When filing a bug report, include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Your OS and Bun version (`bun --version`)

For feature requests, describe the use case and the behavior you would like to see.
