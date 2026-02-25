"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { onLeaderChange } from "@/lib/tab-leader";

const DEFAULT_INTERVAL = 300_000; // 5 minutes

/**
 * Reads and writes the auto-index interval setting from /api/settings.
 * A value of 0 means auto-indexing is disabled.
 */
export function useAutoIndexInterval() {
  const [interval, setIntervalState] = useState<number>(DEFAULT_INTERVAL);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((settings) => {
        if (settings.autoIndexInterval !== undefined) {
          setIntervalState(settings.autoIndexInterval);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const setInterval = useCallback(async (ms: number) => {
    setIntervalState(ms);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoIndexInterval: ms }),
    });
  }, []);

  return { interval, setInterval, loaded };
}

/** Known preset values for the interval dropdown. */
export const INTERVAL_PRESETS = [
  { label: "Off", value: 0 },
  { label: "1m", value: 60_000 },
  { label: "2m", value: 120_000 },
  { label: "5m", value: 300_000 },
  { label: "10m", value: 600_000 },
  { label: "30m", value: 1_800_000 },
  { label: "1h", value: 3_600_000 },
];

/**
 * Runs incremental indexing at the given interval and invalidates query caches after each run.
 * Pass 0 or a negative value to disable.
 *
 * Only the "leader" tab runs the actual indexing to prevent duplicate work
 * when multiple tabs are open. Query cache updates propagate to other tabs
 * via broadcastQueryClient.
 */
export function useAutoIndex(intervalMs: number) {
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(
    null,
  );
  const isLeaderRef = useRef(false);

  // Track leader status
  useEffect(() => {
    const unsub = onLeaderChange((leader) => {
      isLeaderRef.current = leader;
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (intervalMs <= 0) return;

    const run = async () => {
      // Only the leader tab runs background indexing
      if (!isLeaderRef.current) return;

      try {
        const res = await fetch("/api/index?mode=incremental", {
          method: "POST",
        });
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
          queryClient.invalidateQueries({ queryKey: ["sessions"] });
          queryClient.invalidateQueries({ queryKey: ["sessions-grouped"] });
          queryClient.invalidateQueries({ queryKey: ["projects"] });
          queryClient.invalidateQueries({ queryKey: ["analytics"] });
          queryClient.invalidateQueries({ queryKey: ["analytics-projects"] });
          queryClient.invalidateQueries({ queryKey: ["analytics-models"] });
          queryClient.invalidateQueries({ queryKey: ["analytics-tools"] });
        }
      } catch {
        // Silently fail — will retry at next interval
      }

      // Instructions scan (includes routing files via fullScan)
      try {
        const iRes = await fetch("/api/instructions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "scan" }),
        });
        if (iRes.ok) {
          queryClient.invalidateQueries({ queryKey: ["instructions"] });
        }
      } catch {
        /* non-critical */
      }

      // Routing graph refresh (derives edges from instruction_files)
      try {
        const kRes = await fetch("/api/routing/scan?provider=all", { method: "POST" });
        if (kRes.ok) {
          queryClient.invalidateQueries({ queryKey: ["routing-graph"] });
        }
      } catch {
        /* non-critical */
      }
    };

    intervalRef.current = globalThis.setInterval(run, intervalMs);

    return () => {
      if (intervalRef.current) {
        globalThis.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [intervalMs, queryClient]);
}
