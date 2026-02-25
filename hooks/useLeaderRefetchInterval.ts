import { useState, useEffect } from "react";
import { onLeaderChange } from "@/lib/tab-leader";

/**
 * Returns `intervalMs` if this tab is the leader, `false` otherwise.
 * Designed to be passed directly to React Query's `refetchInterval` option
 * so only the leader tab polls the server.
 */
export function useLeaderRefetchInterval(intervalMs: number): number | false {
  const [isLeader, setIsLeader] = useState(false);
  useEffect(() => onLeaderChange(setIsLeader), []);
  return isLeader ? intervalMs : false;
}
