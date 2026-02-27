import { create } from "zustand";

export type ProcessingJobStatus =
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export interface ProcessingJob {
  id: string;
  title: string;
  subtitle?: string;
  provider?: string;
  source?: string;
  status: ProcessingJobStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
}

interface ProcessingStore {
  jobs: ProcessingJob[];
  startJob: (input: {
    id?: string;
    title: string;
    subtitle?: string;
    provider?: string;
    source?: string;
  }) => string;
  completeJob: (
    id: string,
    patch?: Partial<Pick<ProcessingJob, "title" | "subtitle" | "provider" | "source">>,
  ) => void;
  failJob: (
    id: string,
    error: string,
    patch?: Partial<Pick<ProcessingJob, "title" | "subtitle" | "provider" | "source">>,
  ) => void;
  cancelJob: (
    id: string,
    reason?: string,
    patch?: Partial<Pick<ProcessingJob, "title" | "subtitle" | "provider" | "source">>,
  ) => void;
  removeJob: (id: string) => void;
  clearFinished: () => void;
}

const MAX_FINISHED_HISTORY = 80;

function makeJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sortByStartDesc(a: ProcessingJob, b: ProcessingJob): number {
  return b.startedAt - a.startedAt;
}

function sortByFinishDesc(a: ProcessingJob, b: ProcessingJob): number {
  const aTime = a.finishedAt ?? a.startedAt;
  const bTime = b.finishedAt ?? b.startedAt;
  return bTime - aTime;
}

function pruneJobs(jobs: ProcessingJob[]): ProcessingJob[] {
  const running = jobs.filter((job) => job.status === "running").sort(sortByStartDesc);
  const finished = jobs
    .filter((job) => job.status !== "running")
    .sort(sortByFinishDesc)
    .slice(0, MAX_FINISHED_HISTORY);
  return [...running, ...finished];
}

function finalizeJob(
  jobs: ProcessingJob[],
  id: string,
  updater: (job: ProcessingJob) => ProcessingJob,
): ProcessingJob[] {
  let updated = false;
  const next = jobs.map((job) => {
    if (job.id !== id) return job;
    updated = true;
    return updater(job);
  });
  return updated ? pruneJobs(next) : jobs;
}

export const useProcessingStore = create<ProcessingStore>((set) => ({
  jobs: [],

  startJob: (input) => {
    const id = input.id ?? makeJobId();
    const startedAt = Date.now();
    set((state) => {
      const filtered = state.jobs.filter((job) => job.id !== id);
      const next: ProcessingJob = {
        id,
        title: input.title,
        ...(input.subtitle ? { subtitle: input.subtitle } : {}),
        ...(input.provider ? { provider: input.provider } : {}),
        ...(input.source ? { source: input.source } : {}),
        status: "running",
        startedAt,
      };
      return { jobs: pruneJobs([next, ...filtered]) };
    });
    return id;
  },

  completeJob: (id, patch) =>
    set((state) => ({
      jobs: finalizeJob(state.jobs, id, (job) => {
        const finishedAt = Date.now();
        return {
          ...job,
          ...patch,
          status: "completed",
          finishedAt,
          durationMs: Math.max(0, finishedAt - job.startedAt),
          error: undefined,
        };
      }),
    })),

  failJob: (id, error, patch) =>
    set((state) => ({
      jobs: finalizeJob(state.jobs, id, (job) => {
        const finishedAt = Date.now();
        return {
          ...job,
          ...patch,
          status: "failed",
          finishedAt,
          durationMs: Math.max(0, finishedAt - job.startedAt),
          error,
        };
      }),
    })),

  cancelJob: (id, reason, patch) =>
    set((state) => ({
      jobs: finalizeJob(state.jobs, id, (job) => {
        const finishedAt = Date.now();
        return {
          ...job,
          ...patch,
          status: "canceled",
          finishedAt,
          durationMs: Math.max(0, finishedAt - job.startedAt),
          ...(reason ? { error: reason } : {}),
        };
      }),
    })),

  removeJob: (id) =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== id),
    })),

  clearFinished: () =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.status === "running"),
    })),
}));
