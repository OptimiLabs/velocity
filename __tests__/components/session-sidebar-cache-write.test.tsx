import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionSidebar } from "@/components/sessions/SessionSidebar";
import type { Session } from "@/types/session";

vi.mock("@/components/sessions/CostAnalysisPanel", () => ({
  CostAnalysisPanel: ({
    cacheWriteUnavailable,
  }: {
    cacheWriteUnavailable?: boolean;
  }) => (
    <div data-testid="cost-analysis-flag">
      {cacheWriteUnavailable ? "unavailable" : "available"}
    </div>
  ),
}));

const baseSession: Session = {
  id: "s-1",
  project_id: "p-1",
  slug: "session",
  first_prompt: "hello",
  summary: "summary",
  message_count: 3,
  tool_call_count: 1,
  input_tokens: 120,
  output_tokens: 80,
  cache_read_tokens: 40,
  cache_write_tokens: 0,
  thinking_blocks: 1,
  total_cost: 0.01,
  git_branch: "main",
  project_path: "/Users/test/project",
  created_at: "2026-02-25T12:00:00.000Z",
  modified_at: "2026-02-25T12:10:00.000Z",
  jsonl_path: "/tmp/s-1.jsonl",
  tool_usage: "{}",
  model_usage: "{}",
  enriched_tools: "{}",
  session_role: "standalone",
  tags: "[]",
  parent_session_id: null,
  subagent_type: null,
  avg_latency_ms: 100,
  p50_latency_ms: 90,
  p95_latency_ms: 150,
  max_latency_ms: 200,
  latency_sample_count: 2,
  session_duration_ms: 5000,
  pricing_status: "priced",
  unpriced_tokens: 0,
  unpriced_messages: 0,
  provider: "codex",
  effort_mode: null,
};

describe("SessionSidebar cache-write display", () => {
  it("shows N/A cache-write copy when telemetry is unavailable", () => {
    render(
      <SessionSidebar session={baseSession} cacheWriteUnavailable />,
    );

    expect(screen.getByText(/N\/A write/i)).toBeInTheDocument();
    expect(
      screen.getByText("Codex logs currently omit cache write token metrics."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cost-analysis-flag")).toHaveTextContent(
      "unavailable",
    );
  });

  it("shows numeric cache-write when telemetry is available", () => {
    render(<SessionSidebar session={baseSession} />);

    expect(screen.getByText(/0 write/i)).toBeInTheDocument();
    expect(screen.getByTestId("cost-analysis-flag")).toHaveTextContent(
      "available",
    );
  });
});
