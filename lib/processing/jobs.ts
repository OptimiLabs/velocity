import { useProcessingStore } from "@/stores/processingStore";

function normalizeText(value: string | undefined, maxLen = 100): string | undefined {
  if (!value) return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function summarizeForJob(value: string | undefined, maxLen = 96): string | undefined {
  return normalizeText(value, maxLen);
}

export function getErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

export function startProcessingJob(input: {
  title: string;
  subtitle?: string;
  provider?: string;
  source?: string;
}): string {
  return useProcessingStore.getState().startJob({
    ...input,
    subtitle: normalizeText(input.subtitle),
  });
}

export function completeProcessingJob(
  id: string,
  patch?: {
    title?: string;
    subtitle?: string;
    provider?: string;
    source?: string;
  },
): void {
  useProcessingStore.getState().completeJob(id, {
    ...patch,
    subtitle: normalizeText(patch?.subtitle),
  });
}

export function failProcessingJob(
  id: string,
  error: unknown,
  patch?: {
    title?: string;
    subtitle?: string;
    provider?: string;
    source?: string;
  },
): void {
  useProcessingStore.getState().failJob(
    id,
    getErrorMessage(error, "Request failed"),
    {
      ...patch,
      subtitle: normalizeText(patch?.subtitle),
    },
  );
}

export function cancelProcessingJob(
  id: string,
  reason?: string,
  patch?: {
    title?: string;
    subtitle?: string;
    provider?: string;
    source?: string;
  },
): void {
  useProcessingStore.getState().cancelJob(id, reason, {
    ...patch,
    subtitle: normalizeText(patch?.subtitle),
  });
}
