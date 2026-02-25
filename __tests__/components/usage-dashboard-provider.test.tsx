import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { UsageDashboard } from "@/components/usage/UsageDashboard";

const useAnalyticsMock = vi.fn();
const useModelUsageMock = vi.fn();
const useSessionsMock = vi.fn();

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: (...args: unknown[]) => useAnalyticsMock(...args),
  useModelUsage: (...args: unknown[]) => useModelUsageMock(...args),
}));

vi.mock("@/hooks/useSessions", () => ({
  useSessions: (...args: unknown[]) => useSessionsMock(...args),
}));

vi.mock("@/components/layout/KPICard", () => ({
  KPICard: () => <div data-testid="kpi" />,
}));
vi.mock("@/components/analytics/CostChart", () => ({
  CostChart: () => <div data-testid="cost-chart" />,
}));
vi.mock("@/components/usage/ModelBreakdownTable", () => ({
  ModelBreakdownTable: () => <div data-testid="model-breakdown" />,
}));
vi.mock("@/components/usage/SessionCostTable", () => ({
  SessionCostTable: () => <div data-testid="session-table" />,
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

const defaultAnalyticsData = {
  daily: [],
  totals: {
    total_cost: 0,
    total_messages: 0,
    total_sessions: 0,
    total_tool_calls: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_read_tokens: 0,
    total_cache_write_tokens: 0,
    avg_latency_ms: 0,
    avg_p95_latency_ms: 0,
    avg_session_duration_ms: 0,
  },
  previousTotals: {
    total_cost: 0,
    total_messages: 0,
    total_sessions: 0,
    total_tool_calls: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_read_tokens: 0,
    total_cache_write_tokens: 0,
    avg_latency_ms: 0,
    avg_p95_latency_ms: 0,
    avg_session_duration_ms: 0,
  },
};

beforeEach(() => {
  useAnalyticsMock.mockReset();
  useModelUsageMock.mockReset();
  useSessionsMock.mockReset();

  useAnalyticsMock.mockReturnValue({
    data: defaultAnalyticsData,
    isLoading: false,
  });
  useModelUsageMock.mockReturnValue({
    data: { models: [] },
    isLoading: false,
  });
  useSessionsMock.mockReturnValue({
    data: { sessions: [], total: 0 },
    isLoading: false,
  });
});

describe("UsageDashboard provider filters", () => {
  it("passes provider filter to analytics, model usage, and session queries", () => {
    render(
      <UsageDashboard
        from="2026-02-01T00:00:00.000Z"
        to="2026-02-02T00:00:00.000Z"
        provider="codex"
      />,
    );

    expect(useAnalyticsMock).toHaveBeenCalledWith(
      "2026-02-01T00:00:00.000Z",
      "2026-02-02T00:00:00.000Z",
      { provider: "codex" },
      true,
      "hour",
    );
    expect(useModelUsageMock).toHaveBeenCalledWith(
      "2026-02-01T00:00:00.000Z",
      "2026-02-02T00:00:00.000Z",
      { provider: "codex" },
    );
    expect(useSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "codex" }),
    );
  });

  it("uses unfiltered analytics queries when provider is unset", () => {
    render(
      <UsageDashboard
        from="2026-02-01T00:00:00.000Z"
        to="2026-02-04T00:00:00.000Z"
      />,
    );

    expect(useAnalyticsMock).toHaveBeenCalledWith(
      "2026-02-01T00:00:00.000Z",
      "2026-02-04T00:00:00.000Z",
      {},
      true,
      "day",
    );
    expect(useModelUsageMock).toHaveBeenCalledWith(
      "2026-02-01T00:00:00.000Z",
      "2026-02-04T00:00:00.000Z",
      {},
    );
    expect(useSessionsMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ provider: expect.anything() }),
    );
  });
});
