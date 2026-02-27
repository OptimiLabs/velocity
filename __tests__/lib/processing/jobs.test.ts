import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelProcessingJob,
  completeProcessingJob,
  failProcessingJob,
  getErrorMessage,
  startProcessingJob,
  summarizeForJob,
} from "@/lib/processing/jobs";
import { useProcessingStore } from "@/stores/processingStore";

describe("processing jobs helpers", () => {
  beforeEach(() => {
    useProcessingStore.setState({ jobs: [] });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("summarizes and truncates labels", () => {
    expect(summarizeForJob("   hello    world   ")).toBe("hello world");
    expect(summarizeForJob("")).toBeUndefined();
    expect(summarizeForJob("a".repeat(200), 10)).toBe("aaaaaaaaa…");
  });

  it("normalizes errors", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage(" no token ")).toBe("no token");
    expect(getErrorMessage({})).toBe("Request failed");
    expect(getErrorMessage({}, "fallback")).toBe("fallback");
  });

  it("drives lifecycle through helper functions", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(5_000);

    const id = startProcessingJob({
      title: "Generate hook rule",
      subtitle: "   review shell commands before run   ",
      provider: "claude",
      source: "hooks",
    });

    const started = useProcessingStore.getState().jobs.find((job) => job.id === id);
    expect(started?.subtitle).toBe("review shell commands before run");
    expect(started?.status).toBe("running");

    nowSpy.mockReturnValue(7_000);
    completeProcessingJob(id, { subtitle: "done" });
    const completed = useProcessingStore
      .getState()
      .jobs.find((job) => job.id === id);
    expect(completed?.status).toBe("completed");
    expect(completed?.subtitle).toBe("done");
    expect(completed?.durationMs).toBe(2000);

    const failId = startProcessingJob({ title: "Compare sessions" });
    failProcessingJob(failId, new Error("comparison failed"));
    const failed = useProcessingStore
      .getState()
      .jobs.find((job) => job.id === failId);
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("comparison failed");

    const cancelId = startProcessingJob({ title: "Agent chat response" });
    cancelProcessingJob(cancelId, "Stopped by user");
    const canceled = useProcessingStore
      .getState()
      .jobs.find((job) => job.id === cancelId);
    expect(canceled?.status).toBe("canceled");
    expect(canceled?.error).toBe("Stopped by user");
  });
});
