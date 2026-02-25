import { useQuery } from "@tanstack/react-query";
import type { CustomSkill } from "@/lib/skills-shared";
import type { ConfigProvider } from "@/types/provider";

export type { CustomSkill };

export function useSkills(provider: ConfigProvider = "claude") {
  return useQuery({
    queryKey: ["skills", provider],
    queryFn: async (): Promise<CustomSkill[]> => {
      const res = await fetch(`/api/skills?provider=${provider}`);
      if (!res.ok) throw new Error("Failed to fetch skills");
      return res.json();
    },
  });
}
