# Usage [Status: Stable]

Block-based usage monitoring with weekly and monthly views. Tracks local session consumption across supported providers, with breakdowns by model tier, token category, and time period.

## How It Works

### Architecture

1. **Block Usage** -- `BlockUsageCard.tsx` is the primary component, displaying current usage against the user's plan budget. It supports multiple Anthropic plan tiers and shows a progress indicator toward the plan limit.

2. **Plan Budgets** -- `useAnalytics.ts` exports plan constants (`PLAN_BUDGETS`, `PLAN_TOKEN_BUDGETS`, `PLAN_LABELS`, `MAX_PLANS`) that define the spending and token limits for each plan tier. Model tiers (standard, advanced) have separate token budgets via `TIER_TOKEN_BUDGETS`.

3. **Real Usage** -- `useRealUsage` hook fetches actual consumption data, returning sections with per-model breakdowns. `useBlockUsage` provides the aggregated block-level usage for the current billing period.

4. **Model Tiers** -- `getModelTier` from `lib/cost/calculator.ts` classifies models into tiers. Each tier has different pricing and budget allocations. `TIER_LABELS` and `TIER_COLORS` provide display metadata.

5. **Supporting Views** -- `WeekUsageCard.tsx` shows weekly trends, `ModelBreakdownTable.tsx` details per-model consumption, `SessionCostTable.tsx` lists individual session costs, and `OptimizationRecommendations.tsx` suggests ways to reduce usage.

### Data Flow

1. JSONL session logs are parsed and aggregated (same pipeline as Analytics)
2. `/api/usage-live` or `/api/analytics` provides current-period usage data
3. `useBlockUsage` computes usage as a percentage of the selected plan budget
4. `BlockUsageCard.tsx` renders the gauge, KPI cards, and model breakdown
5. Users can configure their plan tier and billing period via `useUpdateBlockSettings`

### Key Metrics

- **Block Usage**: Percentage of plan budget consumed in the current period
- **Cost by Model Tier**: Spending split between standard and advanced model tiers
- **Token Breakdown**: Input, output, cache read, and cache write tokens
- **Session Costs**: Per-session cost distribution and ranking
- **Weekly Trends**: Week-over-week usage comparison

## Usage

### Viewing current usage

1. Navigate to the Usage page from the sidebar
2. The Block Usage card shows your current consumption as a percentage of your plan
3. KPI cards below show total cost, messages, tool calls, and token counts

### Configuring your plan

1. Click the settings icon on the Block Usage card
2. Select your Anthropic plan tier (the budget limits update accordingly)
3. The usage gauge recalculates against the new budget

### Analyzing cost distribution

1. Scroll to the Model Breakdown table to see per-model costs
2. The Session Cost table ranks individual sessions by cost
3. Check Optimization Recommendations for actionable suggestions

## Related Files

- `hooks/useAnalytics.ts` -- Hooks for block usage, real usage, plan budgets, and settings
- `components/usage/BlockUsageCard.tsx` -- Primary block usage gauge and KPI display
- `components/usage/WeekUsageCard.tsx` -- Weekly usage trends
- `components/usage/ModelBreakdownTable.tsx` -- Per-model cost breakdown
- `components/usage/ModelPricingTable.tsx` -- Model pricing reference
- `components/usage/SessionCostTable.tsx` -- Per-session cost ranking
- `components/usage/SessionCostDistribution.tsx` -- Cost distribution visualization
- `components/usage/ToolAnalyticsCard.tsx` -- Tool-level usage within the usage page
- `components/usage/OptimizationRecommendations.tsx` -- Cost optimization suggestions
- `lib/cost/calculator.ts` -- Cost calculation, model tier classification, formatting helpers
- `lib/cost/pricing.ts` -- Per-model pricing rates
- `app/usage/page.tsx` -- Usage page route
