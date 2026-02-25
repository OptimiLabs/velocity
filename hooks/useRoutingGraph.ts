import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type {
  RoutingGraph,
  RoutingEntrypoint,
  ScanProgressEvent,
} from "@/types/routing-graph";
import type { ConfigProvider } from "@/types/provider";

// --- GET cached graph (scoped by entrypoint + provider) ---

export function useRoutingGraph(entrypoint: string = "all", provider?: ConfigProvider) {
  return useQuery<RoutingGraph | null>({
    queryKey: ["routing-graph", entrypoint, provider ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (entrypoint !== "all") params.set("entrypoint", entrypoint);
      if (provider) params.set("provider", provider);
      const qs = params.toString();
      const res = await fetch(`/api/routing/graph${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch graph");
      const data = await res.json();
      return data.graph ?? null;
    },
    staleTime: 60_000, // 1 minute
  });
}

// --- GET entrypoints for scope picker (optionally filtered by provider) ---

export function useEntrypoints(provider?: ConfigProvider) {
  return useQuery<RoutingEntrypoint[]>({
    queryKey: ["routing-entrypoints", provider ?? "all"],
    queryFn: async () => {
      const qs = provider ? `?provider=${provider}` : "";
      const res = await fetch(`/api/routing/entrypoints${qs}`);
      if (!res.ok) throw new Error("Failed to fetch entrypoints");
      const data = await res.json();
      return data.entrypoints ?? [];
    },
    staleTime: 5 * 60_000, // 5 minutes
  });
}

// --- Scan with SSE progress ---

export function useScanRoutingGraph() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<ScanProgressEvent | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const startScan = useCallback(async (provider: ConfigProvider | "all" = "all") => {
    if (isScanning) return;
    setIsScanning(true);
    setProgress({
      type: "progress",
      phase: "discovering",
      current: 0,
      total: 0,
    });

    abortRef.current = new AbortController();

    try {
      const url = provider === "all" ? "/api/routing/scan?provider=all" : `/api/routing/scan?provider=${provider}`;
      const res = await fetch(url, {
        method: "POST",
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`Scan failed: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const chunk of lines) {
          const dataLine = chunk.replace(/^data: /, "").trim();
          if (!dataLine) continue;

          try {
            const event: ScanProgressEvent = JSON.parse(dataLine);
            setProgress(event);

            if (event.type === "complete" && event.graph) {
              // Invalidate all graph queries + entrypoints
              queryClient.invalidateQueries({
                queryKey: ["routing-graph"],
              });
              queryClient.invalidateQueries({
                queryKey: ["routing-entrypoints"],
              });
              toast.success(
                `Scan complete: ${event.graph.nodes.length} files indexed`,
              );
            }
            if (event.type === "error") {
              toast.error(event.error || "Scan error");
            }
          } catch {
            console.debug("[ROUTING] malformed SSE event:", dataLine.slice(0, 100));
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error(`Scan failed: ${(err as Error).message}`);
      }
    } finally {
      setIsScanning(false);
      abortRef.current = null;
    }
  }, [isScanning, queryClient]);

  const cancelScan = useCallback(() => {
    abortRef.current?.abort();
    setIsScanning(false);
  }, []);

  return { startScan, cancelScan, progress, isScanning };
}

// --- Add edge ---

export function useAddGraphEdge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      source: string;
      target: string;
      context: string;
    }) => {
      const res = await fetch("/api/routing/graph/edges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add edge");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-graph"] });
      toast.success("Edge added");
    },
    onError: (err) => {
      toast.error(`Failed to add edge: ${err.message}`);
    },
  });
}

// --- Remove edge ---

export function useRemoveGraphEdge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { source: string; target: string }) => {
      const res = await fetch("/api/routing/graph/edges", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to remove edge");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-graph"] });
      toast.success("Edge removed");
    },
    onError: (err) => {
      toast.error(`Failed to remove edge: ${err.message}`);
    },
  });
}

// --- Save node position ---

export function useSaveNodePosition() {
  return useMutation({
    mutationFn: async (data: { nodeId: string; x: number; y: number }) => {
      const res = await fetch("/api/routing/graph", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save position");
      return res.json();
    },
  });
}

// --- Delete node ---

export function useDeleteRoutingNode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { nodeId: string; deleteFile: boolean }) => {
      const res = await fetch("/api/routing/graph", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete node");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-graph"] });
      toast.success("Node removed");
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });
}

// --- Read file content ---

export function useFileContent(filePath: string | null) {
  const isReadable = !!filePath && filePath.endsWith(".md");
  return useQuery({
    queryKey: ["filesystem-read", filePath],
    queryFn: async () => {
      if (!filePath) return null;
      const res = await fetch(
        `/api/filesystem/read?path=${encodeURIComponent(filePath)}`,
      );
      if (!res.ok) throw new Error("Failed to read file");
      return res.json();
    },
    enabled: isReadable,
    staleTime: 30_000,
  });
}
