import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect } from "react";
import { toast } from "sonner";
import type { MarketplaceSource, MarketplaceItem } from "@/types/marketplace";
import type { ConfigProvider } from "@/types/provider";
import type {
  SecurityAnalysisRequest,
  SecurityAnalysisResult,
} from "@/types/security-analysis";
import {
  completeProcessingJob,
  failProcessingJob,
  startProcessingJob,
  summarizeForJob,
} from "@/lib/processing/jobs";

function extractFirstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseJsonLoose<T>(raw: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const jsonObject = extractFirstJsonObject(trimmed);
    if (!jsonObject) return null;
    try {
      return JSON.parse(jsonObject) as T;
    } catch {
      return null;
    }
  }
}

function readErrorMessageFromBody(
  parsed: unknown,
  raw: string,
  fallback: string,
): string {
  if (
    parsed &&
    typeof parsed === "object" &&
    "error" in parsed &&
    typeof (parsed as { error?: unknown }).error === "string"
  ) {
    return (parsed as { error: string }).error;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;
  if (trimmed.length <= 240) return trimmed;
  return `${trimmed.slice(0, 240)}…`;
}

export function useMarketplaceSources() {
  return useQuery({
    queryKey: ["marketplace-sources"],
    queryFn: async (): Promise<MarketplaceSource[]> => {
      const res = await fetch("/api/marketplace/sources");
      if (!res.ok) throw new Error("Failed to fetch sources");
      return res.json();
    },
  });
}

export function useAddSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: {
      name: string;
      source_type: string;
      config: Record<string, string>;
    }) => {
      const res = await fetch("/api/marketplace/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add source");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace-sources"] });
      qc.invalidateQueries({ queryKey: ["marketplace-search"] });
      toast.success("Source added");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useToggleSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch(`/api/marketplace/sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update source");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace-sources"] });
      qc.invalidateQueries({ queryKey: ["marketplace-search"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/marketplace/sources/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete source");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace-sources"] });
      qc.invalidateQueries({ queryKey: ["marketplace-search"] });
      toast.success("Source removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMarketplaceSearch(
  sourceId: string,
  query: string,
  typeFilter: string,
  providerScope: ConfigProvider,
) {
  return useQuery({
    queryKey: ["marketplace-search", sourceId, query, typeFilter, providerScope],
    queryFn: async (): Promise<MarketplaceItem[]> => {
      const params = new URLSearchParams();
      if (sourceId) params.set("sourceId", sourceId);
      if (query) params.set("q", query);
      if (typeFilter) params.set("type", typeFilter);
      params.set("provider", providerScope);
      const res = await fetch(`/api/marketplace/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    staleTime: 30_000,
  });
}

/**
 * Starts a background install job and polls for completion.
 * Returns the mutation for triggering installs — toast notifications
 * are handled automatically via polling.
 */
export interface PluginInstallResult {
  installed: string;
  method: string;
  agents: string[];
  skills: string[];
  commands: string[];
  targetProvider?: ConfigProvider;
}

export function useInstallPackage(opts?: {
  onPluginInstalled?: (name: string, result: PluginInstallResult) => void;
}) {
  const qc = useQueryClient();
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map(),
  );

  // Cleanup poll timers on unmount
  useEffect(() => {
    const timers = pollTimers.current;
    return () => {
      for (const timer of timers.values()) clearInterval(timer);
    };
  }, []);

  const pollJob = (
    jobId: string,
    displayName: string,
    toastId: string | number,
  ) => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/marketplace/install?jobId=${jobId}`);
        if (!res.ok) {
          clearInterval(timer);
          pollTimers.current.delete(jobId);
          toast.error(`Install failed: ${displayName}`, { id: toastId });
          return;
        }
        const job = await res.json();
        if (job.status === "completed") {
          clearInterval(timer);
          pollTimers.current.delete(jobId);
          const METHOD_LABELS: Record<string, string> = {
            "mcp-npx": "as MCP server",
            "mcp-config": "as MCP server",
            skill: "as skill",
            hook: "as hook",
            plugin: "",
            "source-added": "— added as marketplace source",
          };
          const methodLabel = METHOD_LABELS[job.result?.method ?? ""] ?? "";
          toast.success(
            `Installed ${displayName}${methodLabel ? ` ${methodLabel}` : ""}`,
            { id: toastId },
          );
          // If this install produced component breakdowns, fire callback
          if (
            job.result?.agents?.length ||
            job.result?.skills?.length ||
            job.result?.commands?.length
          ) {
            opts?.onPluginInstalled?.(displayName, job.result as PluginInstallResult);
          }
          qc.invalidateQueries({ queryKey: ["marketplace-search"] });
          qc.invalidateQueries({ queryKey: ["marketplace-sources"] });
          qc.invalidateQueries({ queryKey: ["instructions"] });
          qc.invalidateQueries({ queryKey: ["knowledge-files"] });
          qc.invalidateQueries({ queryKey: ["tools"] });
          qc.invalidateQueries({ queryKey: ["skills"] });
          window.dispatchEvent(new CustomEvent("mcp:restart-sessions"));
        } else if (job.status === "failed") {
          clearInterval(timer);
          pollTimers.current.delete(jobId);
          toast.error(job.error || `Failed to install ${displayName}`, {
            id: toastId,
          });
        } else if (
          job.retries > 0 &&
          (job.status === "pending" || job.status === "running")
        ) {
          toast.loading(`Installing ${displayName} (retry ${job.retries})...`, {
            id: toastId,
          });
        }
      } catch {
        // Network error polling — keep trying
      }
    }, 1000);
    pollTimers.current.set(jobId, timer);
  };

  return useMutation({
    mutationFn: async (pkg: {
      type: string;
      url: string;
      name: string;
      config?: Record<string, unknown>;
      targetProvider?: ConfigProvider;
    }) => {
      const res = await fetch("/api/marketplace/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pkg),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Install failed");
      }
      return res.json() as Promise<{
        jobId: string;
        status: string;
        name: string;
      }>;
    },
    onSuccess: (data) => {
      const toastId = toast.loading(`Installing ${data.name}...`);
      pollJob(data.jobId, data.name, toastId);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useAnalyzeRepo() {
  return useMutation({
    mutationFn: async (params: {
      owner: string;
      repo: string;
    }): Promise<SecurityAnalysisResult> => {
      const jobId = startProcessingJob({
        title: "Analyze repository security",
        subtitle: summarizeForJob(`${params.owner}/${params.repo}`),
        source: "marketplace",
      });
      try {
        const res = await fetch("/api/marketplace/analyze-repo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        const raw = await res.text();
        const parsed = parseJsonLoose<SecurityAnalysisResult & { error?: string }>(raw);

        if (!res.ok) {
          throw new Error(readErrorMessageFromBody(parsed, raw, "Repo analysis failed"));
        }
        if (!parsed) {
          throw new Error("Repo analysis returned an unreadable response");
        }
        const result = parsed as SecurityAnalysisResult;
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob(`${params.owner}/${params.repo}`),
        });
        return result;
      } catch (error) {
        failProcessingJob(jobId, error, {
          subtitle: summarizeForJob(`${params.owner}/${params.repo}`),
        });
        throw error;
      }
    },
  });
}

export function useAnalyzePlugin() {
  return useMutation({
    mutationFn: async (
      params: SecurityAnalysisRequest,
    ): Promise<SecurityAnalysisResult> => {
      const jobId = startProcessingJob({
        title: "Analyze package security",
        subtitle: summarizeForJob(params.name || params.url || "Marketplace item"),
        source: "marketplace",
      });
      try {
        const res = await fetch("/api/marketplace/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        const raw = await res.text();
        const parsed = parseJsonLoose<SecurityAnalysisResult & { error?: string }>(raw);
        if (!res.ok) {
          throw new Error(readErrorMessageFromBody(parsed, raw, "Analysis failed"));
        }
        if (!parsed) {
          throw new Error("Analysis returned an unreadable response");
        }
        const result = parsed as SecurityAnalysisResult;
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob(params.name || params.url || "Analysis complete"),
        });
        return result;
      } catch (error) {
        failProcessingJob(jobId, error, {
          subtitle: summarizeForJob(params.name || params.url || "Marketplace item"),
        });
        throw error;
      }
    },
  });
}

export function useUninstallPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pkg: {
      type: string;
      name: string;
      targetProvider?: ConfigProvider;
      marketplaceRepo?: string;
      url?: string;
      sourcePath?: string;
      defaultBranch?: string;
    }) => {
      const res = await fetch("/api/marketplace/uninstall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pkg),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Uninstall failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketplace-search"] });
      qc.invalidateQueries({ queryKey: ["tools"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["instructions"] });
      qc.invalidateQueries({ queryKey: ["knowledge-files"] });
      toast.success("Uninstalled");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useTogglePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pkg: {
      type: string;
      name: string;
      enabled: boolean;
      targetProvider?: ConfigProvider;
      marketplaceRepo?: string;
    }) => {
      const res = await fetch("/api/marketplace/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pkg),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Toggle failed");
      }
      return res.json() as Promise<{ success: boolean; enabled: boolean }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["marketplace-search"] });
      qc.invalidateQueries({ queryKey: ["tools"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["instructions"] });
      qc.invalidateQueries({ queryKey: ["knowledge-files"] });
      window.dispatchEvent(new CustomEvent("mcp:restart-sessions"));
      toast.success(result.enabled ? "Enabled" : "Disabled");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
