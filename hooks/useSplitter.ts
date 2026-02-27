import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SplitResult } from "@/lib/instructions/claudemd-splitter";
import type { AISplitAssignment } from "@/lib/instructions/ai-split-planner";
import {
  completeProcessingJob,
  failProcessingJob,
  startProcessingJob,
  summarizeForJob,
} from "@/lib/processing/jobs";

export function useAnalyzeSplit() {
  return useMutation({
    mutationFn: async (filePath: string): Promise<SplitResult> => {
      const res = await fetch("/api/instructions/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", filePath }),
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Analysis failed" }));
        throw new Error(err.error || "Analysis failed");
      }
      return res.json();
    },
    onError: () => toast.error("Failed to analyze CLAUDE.md"),
  });
}

export function useExecuteSplit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      sourceFilePath: string;
      sections: {
        heading: string;
        content: string;
        category: string;
        filename: string;
      }[];
      updateRouter: boolean;
    }) => {
      const res = await fetch("/api/instructions/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "execute", ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Split failed" }));
        throw new Error(err.error || "Split failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      toast.success("Knowledge files created");
    },
    onError: () => toast.error("Failed to split CLAUDE.md"),
  });
}

export function useAISplit() {
  return useMutation({
    mutationFn: async (data: {
      filePath: string;
      guidelines?: string;
      structureMode: "existing" | "ai-decide";
      existingCategories?: string[];
      provider?: string;
    }): Promise<SplitResult & { aiAssignments: AISplitAssignment[]; aiFailed?: boolean }> => {
      const jobId = startProcessingJob({
        title: "Organize instructions with AI",
        subtitle: summarizeForJob(data.filePath),
        source: "instructions",
        provider: data.provider,
      });
      try {
        const res = await fetch("/api/instructions/split", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ai-split", ...data }),
        });
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: "AI split failed" }));
          throw new Error(err.error || "AI split failed");
        }
        const result = (await res.json()) as SplitResult & {
          aiAssignments: AISplitAssignment[];
          aiFailed?: boolean;
        };
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob(
            `${result.aiAssignments?.length ?? 0} AI assignments`,
          ),
        });
        return result;
      } catch (error) {
        failProcessingJob(jobId, error, {
          subtitle: summarizeForJob(data.filePath),
        });
        throw error;
      }
    },
    onError: () => toast.error("AI organization failed"),
  });
}

export function useExistingStructure() {
  return useQuery({
    queryKey: ["knowledge-structure"],
    queryFn: async (): Promise<{
      categories: string[];
      files: { category: string; filename: string }[];
    }> => {
      const res = await fetch("/api/instructions/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-structure" }),
      });
      if (!res.ok) {
        throw new Error("Failed to load structure");
      }
      return res.json();
    },
  });
}
