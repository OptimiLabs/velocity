export const MAX_INFERRED_TURN_LATENCY_MS = 600_000;

export interface LatencySummary {
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;
  sampleCount: number;
}

export function maybeRecordTurnLatency(
  turnLatencies: number[],
  deltaMs: number,
): void {
  if (!Number.isFinite(deltaMs)) return;
  if (deltaMs <= 0) return;
  if (deltaMs >= MAX_INFERRED_TURN_LATENCY_MS) return;
  turnLatencies.push(deltaMs);
}

export function summarizeLatencies(turnLatencies: number[]): LatencySummary {
  if (turnLatencies.length === 0) {
    return {
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      maxLatencyMs: 0,
      sampleCount: 0,
    };
  }

  const sorted = [...turnLatencies].sort((a, b) => a - b);
  const count = sorted.length;
  const avgLatencyMs = sorted.reduce((sum, value) => sum + value, 0) / count;
  const p50LatencyMs = sorted[Math.floor(count * 0.5)] ?? 0;
  const p95LatencyMs =
    sorted[Math.min(Math.ceil(count * 0.95) - 1, count - 1)] ?? 0;
  const maxLatencyMs = sorted[count - 1] ?? 0;

  return {
    avgLatencyMs,
    p50LatencyMs,
    p95LatencyMs,
    maxLatencyMs,
    sampleCount: count,
  };
}
