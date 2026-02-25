# Analytics [Status: Stable]

Cost tracking, token usage analysis, and tool frequency insights derived from local CLI session logs (Claude Code, Codex CLI, Gemini CLI). Provides daily/weekly trends, model comparisons, per-project breakdowns, and latency metrics.

## How It Works

### Architecture

Analytics operates as a pipeline from raw JSONL logs to interactive charts:

1. **JSONL Parsing** -- `lib/parser/jsonl.ts` reads Claude Code session log files (`.jsonl`). It supports both full-file parsing (`parseJsonlFile`) and a streaming async generator (`streamJsonlFile`) that keeps memory proportional to a single message.

2. **Session Aggregation** -- `lib/parser/session-aggregator.ts` processes parsed messages to compute `SessionStats`: message counts, token totals (input/output/cache-read/cache-write), cost via `lib/cost/calculator.ts`, tool usage frequency, model usage breakdown, latency percentiles (p50/p95/max), and auto-generated summaries.

3. **Cost Calculation** -- `lib/cost/calculator.ts` resolves per-model pricing from `lib/cost/pricing.ts` with exact-match and prefix-match fallback for dated model variants. Computes cost as `(tokens / 1M) * rate` for each token category.

4. **API Layer** -- `app/api/analytics/` serves aggregated data with filtering by project, role, model, and agent type. Supports date range queries and returns daily stats, totals with period-over-period comparison, weekly rollups, and cost distribution histograms.

5. **Frontend** -- `components/analytics/` renders the data through multiple chart types: `CostChart.tsx` for spending trends, `TokenChart.tsx` for token volume, `ActivityChart.tsx` for session frequency, `LatencyChart.tsx` for response times, `ModelComparison.tsx` for side-by-side model analysis, and `ProjectCostChart.tsx` for per-project breakdowns.

### Data Flow

1. Provider CLIs write local session logs (`~/.claude/projects/`, `~/.codex/sessions/`, `~/.gemini/tmp/`)
2. The file watcher (`lib/watcher/`) detects new/modified files and triggers re-indexing
3. Session aggregator computes stats and stores them in SQLite via `lib/db/`
4. `useAnalytics` hook (TanStack React Query) fetches from `/api/analytics` with filter parameters
5. Chart components render the data with filtering controlled by `FilterBar.tsx`

### Key Metrics

- **Cost**: Total USD spent, broken down by model and day
- **Tokens**: Input, output, cache read, and cache write token counts
- **Tool Usage**: Frequency of each tool (Read, Write, Edit, Bash, Grep, etc.)
- **Latency**: Average, p50, p95, and max response times
- **Sessions**: Count, duration, and activity patterns
- **Models**: Per-model cost efficiency and token distribution

## Usage

### Viewing the dashboard

1. Navigate to the Analytics page from the sidebar
2. The default view shows the last 30 days of data
3. Use the filter bar to narrow by project, model, or role
4. Click on chart elements to drill down into specific days or sessions

### Exploring tool usage

1. Navigate to Analytics > Tools from the sub-navigation
2. View tool call frequency, expensive tools (by associated cost), and tool-specific patterns
3. The sidebar card shows quick tool stats from the main analytics page

### Filtering data

The `FilterBar.tsx` supports:

- **Project**: Scope to a specific project directory
- **Model**: Filter by one or more Claude models (AND/OR logic)
- **Role**: Filter by session role (standalone, subagent)
- **Agent Type**: Filter by agent classification

## Related Files

- `hooks/useAnalytics.ts` -- React Query hooks for fetching analytics data with filters
- `lib/parser/jsonl.ts` -- JSONL file parser (batch and streaming)
- `lib/parser/session-aggregator.ts` -- Computes SessionStats from parsed messages
- `lib/cost/calculator.ts` -- Token-to-cost calculation with model pricing lookup
- `lib/cost/pricing.ts` -- Per-model pricing rates
- `components/analytics/CostChart.tsx` -- Cost trend chart
- `components/analytics/TokenChart.tsx` -- Token volume chart
- `components/analytics/FilterBar.tsx` -- Analytics filter controls
- `components/analytics/ModelComparison.tsx` -- Model-vs-model analysis
- `app/api/analytics/` -- API routes for analytics data
- `types/session.ts` -- TypeScript types for sessions and daily stats
