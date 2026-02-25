import { useQuery } from "@tanstack/react-query";
import { useLeaderRefetchInterval } from "@/hooks/useLeaderRefetchInterval";
import type { Session, OverallStats, DailyStats } from "@/types/session";

interface DashboardData {
  overall: OverallStats;
  today: DailyStats;
  recentSessions: Session[];
  projectCount: number;
  lastIndexedAt: string | null;
  dbSizeBytes: number;
}

export function useDashboardStats() {
  const refetchInterval = useLeaderRefetchInterval(300_000);
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async (): Promise<DashboardData> => {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval,
    staleTime: 120_000,
  });
}
