import { useMutation, useQueryClient } from "@tanstack/react-query";

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
      const res = await fetch("/api/skills/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Merge failed");
      }
      return res.json();
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
