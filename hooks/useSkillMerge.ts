import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  completeProcessingJob,
  failProcessingJob,
  startProcessingJob,
  summarizeForJob,
} from "@/lib/processing/jobs";

interface MergeSkillRequest {
  skills: Array<{
    name: string;
    origin: "user" | "plugin";
    projectPath?: string;
    content?: string;
  }>;
  prompt: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  provider?: "anthropic" | "openai" | "custom" | "claude-cli";
}

interface MergeSkillResponse {
  content: string;
  name: string;
  description: string;
  category?: string;
  tokensUsed: number;
  cost: number;
}

export function useMergeSkills() {
  return useMutation({
    mutationFn: async (req: MergeSkillRequest): Promise<MergeSkillResponse> => {
      const jobId = startProcessingJob({
        title: "Merge skills with AI",
        subtitle: summarizeForJob(req.prompt),
        source: "skills",
        provider: req.provider,
      });
      try {
        const res = await fetch("/api/skills/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Merge failed");
        }
        const result = (await res.json()) as MergeSkillResponse;
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob(result.name ? `Generated ${result.name}` : "Merge complete"),
        });
        return result;
      } catch (error) {
        failProcessingJob(jobId, error, {
          subtitle: summarizeForJob(req.prompt),
        });
        throw error;
      }
    },
  });
}

interface ArchiveSkillsRequest {
  skills: Array<{
    name: string;
    projectPath?: string;
  }>;
}

export function useArchiveSkills() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      req: ArchiveSkillsRequest,
    ): Promise<{ archived: number; total: number }> => {
      const res = await fetch("/api/skills/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Archive failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
