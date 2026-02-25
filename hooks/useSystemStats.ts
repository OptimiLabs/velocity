import { useQuery } from "@tanstack/react-query";
import { useLeaderRefetchInterval } from "@/hooks/useLeaderRefetchInterval";

export interface SystemStats {
  cpu: number;
  cpuCount: number;
  memory: { total: number; used: number; percent: number };
  process: { rss: number; heapUsed: number; heapTotal: number };
}

export function useSystemStats() {
  const refetchInterval = useLeaderRefetchInterval(30_000);
  return useQuery({
    queryKey: ["system-stats"],
    queryFn: async (): Promise<SystemStats> => {
      const res = await fetch("/api/system");
      if (!res.ok) throw new Error("Failed to fetch system stats");
      return res.json();
    },
    refetchInterval,
    staleTime: 30_000,
  });
}
