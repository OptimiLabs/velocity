import {
  calculateCostDetailed,
  type PricingUnpricedReason,
} from "@/lib/cost/calculator";
import { getPricingSnapshotVersion } from "@/lib/cost/pricing";

export interface PricingAuditSessionRow {
  id: string;
  provider: string | null;
  billing_plan: string | null;
  effort_mode: string | null;
  total_cost: number;
  model_usage: string | null;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  pricing_status?: string | null;
  unpriced_tokens?: number;
  unpriced_messages?: number;
}

export interface PricingAuditMismatch {
  id: string;
  provider: string;
  effortMode: string;
  billingPlan: string;
  totalCost: number;
  recomputedCost: number;
  absoluteDiff: number;
  percentDiff: number;
}

export interface UnknownModelSummary {
  model: string;
  provider: string;
  sessions: number;
  billableTokens: number;
  reportedCost: number;
  reason: PricingUnpricedReason;
}

interface AggregateBucket {
  sessions: number;
  totalCost: number;
  recomputedCost: number;
  absoluteDiff: number;
}

export interface PricingAuditResult {
  snapshotVersion: string;
  totalSessions: number;
  comparedSessions: number;
  skippedSessions: number;
  estimatedPlanSessions: number;
  mismatchSessions: number;
  unpricedSessions: number;
  unpricedTokens: number;
  unpricedMessages: number;
  totalCost: number;
  recomputedCost: number;
  absoluteDiff: number;
  averageAbsoluteDiff: number;
  averagePercentDiff: number;
  byProvider: Record<string, AggregateBucket>;
  byEffortMode: Record<string, AggregateBucket>;
  unknownModels: UnknownModelSummary[];
  topMismatches: PricingAuditMismatch[];
}

interface NormalizedModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  pricingStatus?: "priced" | "unpriced";
  unpricedTokens?: number;
}

function readNumeric(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeModelUsage(value: unknown): NormalizedModelUsage {
  if (!value || typeof value !== "object") {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
  }
  const record = value as Record<string, unknown>;
  const pricingStatusRaw =
    typeof record.pricingStatus === "string"
      ? record.pricingStatus
      : typeof record.pricing_status === "string"
        ? record.pricing_status
        : undefined;
  return {
    inputTokens: readNumeric(record, ["inputTokens", "input_tokens"]),
    outputTokens: readNumeric(record, ["outputTokens", "output_tokens"]),
    cacheReadTokens: readNumeric(record, [
      "cacheReadTokens",
      "cache_read_tokens",
      "cacheReadInputTokens",
      "cache_read_input_tokens",
    ]),
    cacheWriteTokens: readNumeric(record, [
      "cacheWriteTokens",
      "cache_write_tokens",
      "cacheWriteInputTokens",
      "cache_write_input_tokens",
      "cacheCreationInputTokens",
      "cache_creation_input_tokens",
    ]),
    pricingStatus:
      pricingStatusRaw === "unpriced" || pricingStatusRaw === "priced"
        ? pricingStatusRaw
        : undefined,
    unpricedTokens: readNumeric(record, ["unpricedTokens", "unpriced_tokens"]),
  };
}

function parseModelUsage(
  modelUsage: string | null,
): Record<string, NormalizedModelUsage> {
  if (!modelUsage) return {};
  try {
    const parsed = JSON.parse(modelUsage) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const normalized: Record<string, NormalizedModelUsage> = {};
    for (const [model, usage] of Object.entries(parsed)) {
      normalized[model] = normalizeModelUsage(usage);
    }
    return normalized;
  } catch {
    return {};
  }
}

function normalizeLabel(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : fallback;
}

function toPercentDiff(totalCost: number, absoluteDiff: number): number {
  if (totalCost <= 0) return absoluteDiff > 0 ? 100 : 0;
  return (absoluteDiff / totalCost) * 100;
}

function upsertBucket(
  target: Record<string, AggregateBucket>,
  key: string,
  totalCost: number,
  recomputedCost: number,
  absoluteDiff: number,
) {
  const existing = target[key] ?? {
    sessions: 0,
    totalCost: 0,
    recomputedCost: 0,
    absoluteDiff: 0,
  };
  existing.sessions += 1;
  existing.totalCost += totalCost;
  existing.recomputedCost += recomputedCost;
  existing.absoluteDiff += absoluteDiff;
  target[key] = existing;
}

export function auditSessionPricing(rows: PricingAuditSessionRow[]): PricingAuditResult {
  const mismatches: PricingAuditMismatch[] = [];
  const byProvider: Record<string, AggregateBucket> = {};
  const byEffortMode: Record<string, AggregateBucket> = {};
  const unknownModelMap = new Map<string, UnknownModelSummary>();

  let comparedSessions = 0;
  let skippedSessions = 0;
  let estimatedPlanSessions = 0;
  let mismatchSessions = 0;
  let unpricedSessions = 0;
  let unpricedTokens = 0;
  let unpricedMessages = 0;
  let totalCost = 0;
  let recomputedCost = 0;
  let absoluteDiff = 0;
  let percentDiffAccumulator = 0;

  for (const row of rows) {
    const provider = normalizeLabel(row.provider, "claude");
    const effortMode = normalizeLabel(row.effort_mode, "unknown");
    const billingPlan = normalizeLabel(row.billing_plan, "unknown");
    const rowTotalCost =
      typeof row.total_cost === "number" && Number.isFinite(row.total_cost)
        ? row.total_cost
        : 0;

    if (billingPlan.includes("max")) {
      estimatedPlanSessions += 1;
    }

    const modelUsage = parseModelUsage(row.model_usage);
    const modelEntries = Object.entries(modelUsage);
    if (modelEntries.length === 0) {
      skippedSessions += 1;
      continue;
    }

    comparedSessions += 1;
    totalCost += rowTotalCost;

    let rowRecomputed = 0;
    let rowUnpricedTokens = 0;
    let rowHasUnpricedModel = false;

    for (const [model, usage] of modelEntries) {
      const recomputed = calculateCostDetailed(
        model,
        usage.inputTokens,
        usage.outputTokens,
        usage.cacheReadTokens,
        usage.cacheWriteTokens,
      );
      rowRecomputed += recomputed.cost;

      const usageTokens = recomputed.totalBillableTokens;
      const modelMarkedUnpriced =
        usage.pricingStatus === "unpriced" || recomputed.status === "unpriced";
      if (modelMarkedUnpriced && usageTokens > 0) {
        rowHasUnpricedModel = true;
        const modelUnpricedTokens = usage.unpricedTokens || usageTokens;
        rowUnpricedTokens += modelUnpricedTokens;

        const key = `${provider}:${model}`;
        const existing = unknownModelMap.get(key) ?? {
          model,
          provider,
          sessions: 0,
          billableTokens: 0,
          reportedCost: 0,
          reason: recomputed.reason ?? "model_not_found",
        };
        existing.sessions += 1;
        existing.billableTokens += modelUnpricedTokens;
        existing.reportedCost += rowTotalCost;
        existing.reason = recomputed.reason ?? existing.reason;
        unknownModelMap.set(key, existing);
      }
    }

    recomputedCost += rowRecomputed;
    const rowAbsDiff = Math.abs(rowTotalCost - rowRecomputed);
    const rowPctDiff = toPercentDiff(rowTotalCost, rowAbsDiff);
    absoluteDiff += rowAbsDiff;
    percentDiffAccumulator += rowPctDiff;

    upsertBucket(byProvider, provider, rowTotalCost, rowRecomputed, rowAbsDiff);
    upsertBucket(byEffortMode, effortMode, rowTotalCost, rowRecomputed, rowAbsDiff);

    const rowUnpricedMessages =
      typeof row.unpriced_messages === "number" && row.unpriced_messages > 0
        ? row.unpriced_messages
        : rowHasUnpricedModel
          ? 1
          : 0;

    if (rowHasUnpricedModel) {
      unpricedSessions += 1;
      unpricedTokens += Math.max(rowUnpricedTokens, row.unpriced_tokens || 0);
      unpricedMessages += rowUnpricedMessages;
    }

    // Differences below one-tenth cent are treated as equivalent rounding.
    // Sessions with unpriced usage are tracked separately, not as parity mismatches.
    if (!rowHasUnpricedModel && rowAbsDiff > 0.001) {
      mismatchSessions += 1;
      mismatches.push({
        id: row.id,
        provider,
        effortMode,
        billingPlan,
        totalCost: rowTotalCost,
        recomputedCost: rowRecomputed,
        absoluteDiff: rowAbsDiff,
        percentDiff: rowPctDiff,
      });
    }
  }

  mismatches.sort(
    (a, b) =>
      b.absoluteDiff - a.absoluteDiff || b.percentDiff - a.percentDiff,
  );

  const unknownModels = [...unknownModelMap.values()].sort(
    (a, b) => b.billableTokens - a.billableTokens || b.sessions - a.sessions,
  );

  return {
    snapshotVersion: getPricingSnapshotVersion(),
    totalSessions: rows.length,
    comparedSessions,
    skippedSessions,
    estimatedPlanSessions,
    mismatchSessions,
    unpricedSessions,
    unpricedTokens,
    unpricedMessages,
    totalCost,
    recomputedCost,
    absoluteDiff,
    averageAbsoluteDiff: comparedSessions > 0 ? absoluteDiff / comparedSessions : 0,
    averagePercentDiff:
      comparedSessions > 0 ? percentDiffAccumulator / comparedSessions : 0,
    byProvider,
    byEffortMode,
    unknownModels,
    topMismatches: mismatches.slice(0, 25),
  };
}
