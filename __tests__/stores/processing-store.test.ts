import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProcessingStore } from "@/stores/processingStore";

describe("processingStore", () => {
  beforeEach(() => {
    useProcessingStore.setState({ jobs: [] });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("tracks running to completed lifecycle", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1000);

    const id = useProcessingStore
      .getState()
      .startJob({ title: "Generate workflow plan", subtitle: "auth flow" });

    const started = useProcessingStore.getState().jobs.find((job) => job.id === id);
    expect(started).toBeDefined();
    expect(started?.status).toBe("running");
    expect(started?.startedAt).toBe(Date.now());

    nowSpy.mockReturnValue(5500);
    useProcessingStore.getState().completeJob(id);

    const completed = useProcessingStore
      .getState()
      .jobs.find((job) => job.id === id);
    expect(completed?.status).toBe("completed");
    expect(completed?.durationMs).toBe(4500);
    expect(completed?.finishedAt).toBe(Date.now());
    expect(completed?.error).toBeUndefined();
  });

  it("tracks failed and canceled states", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(10_000);

    const failId = useProcessingStore
      .getState()
      .startJob({ title: "Compare sessions" });
    nowSpy.mockReturnValue(12_000);
    useProcessingStore.getState().failJob(failId, "Comparison failed");

    const failed = useProcessingStore
      .getState()
      .jobs.find((job) => job.id === failId);
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("Comparison failed");
    expect(failed?.durationMs).toBe(2000);

    const cancelId = useProcessingStore
      .getState()
      .startJob({ title: "Agent chat response" });
    nowSpy.mockReturnValue(13_500);
    useProcessingStore.getState().cancelJob(cancelId, "Stopped by user");

    const canceled = useProcessingStore
      .getState()
      .jobs.find((job) => job.id === cancelId);
    expect(canceled?.status).toBe("canceled");
    expect(canceled?.error).toBe("Stopped by user");
    expect(canceled?.durationMs).toBe(1500);
  });

  it("prunes finished history while keeping running jobs", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(100);

    const runningId = useProcessingStore
      .getState()
      .startJob({ title: "Long running workflow" });

    for (let i = 0; i < 100; i += 1) {
      nowSpy.mockReturnValue(1_000 + i);
      const id = useProcessingStore
        .getState()
        .startJob({ title: `job-${i}` });
      nowSpy.mockReturnValue(2_000 + i);
      useProcessingStore.getState().completeJob(id);
    }

    const jobs = useProcessingStore.getState().jobs;
    const runningJobs = jobs.filter((job) => job.status === "running");
    const finishedJobs = jobs.filter((job) => job.status !== "running");

    expect(runningJobs).toHaveLength(1);
    expect(runningJobs[0]?.id).toBe(runningId);
    expect(finishedJobs).toHaveLength(80);
    expect(jobs).toHaveLength(81);
  });
});
