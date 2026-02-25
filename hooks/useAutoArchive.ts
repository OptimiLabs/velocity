"use client";

import { useEffect, useRef } from "react";
import { useConsole } from "@/components/providers/ConsoleProvider";

const CHECK_INTERVAL_MS = 60_000; // 60 seconds
const DEFAULT_ARCHIVE_DAYS = 0;
const WARMUP_MS = 60_000; // Don't archive groups within 60s of mount
const RECENT_SESSION_MS = 5 * 60 * 1000; // Skip groups with sessions created in last 5 min

/**
 * Auto-archives idle console sessions that exceed the configured inactivity threshold.
 * Also archives background groups whose all sessions are idle and lastActivityAt exceeds threshold.
 * Runs on mount and every 60s. Skips the currently active session/group.
 *
 * Uses the same configurable `autoArchiveDays` threshold for both sessions and groups.
 * Includes a warmup guard to prevent archiving groups on page reload before PTYs reconnect.
 */
export function useAutoArchive() {
  const {
    activeId,
    archiveSession,
    sessions,
    activeGroupId,
    groups,
    archiveGroup,
  } = useConsole();
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const activeGroupIdRef = useRef(activeGroupId);
  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  const mountTimeRef = useRef(0);
  useEffect(() => {
    mountTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    async function checkAndArchive() {
      try {
        const settingsRes = await fetch("/api/settings?provider=app");
        const settings = settingsRes.ok ? await settingsRes.json() : {};
        const days = settings.autoArchiveDays ?? DEFAULT_ARCHIVE_DAYS;
        if (days <= 0) return; // disabled

        const thresholdMs = days * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - thresholdMs;
        const currentActiveId = activeIdRef.current;

        // Check local sessions for idle candidates
        for (const [id, session] of sessions) {
          if (id === currentActiveId) continue; // never archive the active session
          if (session.status !== "idle") continue; // only archive idle sessions
          if (session.kind === "shell") continue; // never auto-archive shell sessions

          // Use createdAt as fallback for activity time
          const lastActivity = session.createdAt;
          if (lastActivity < cutoff) {
            archiveSession(id);
          }
        }

        // Skip group archiving during warmup period (PTYs may still be reconnecting)
        const isWarmup = Date.now() - mountTimeRef.current < WARMUP_MS;
        if (isWarmup) return;

        // Check background groups using the same days-based threshold as sessions
        const currentActiveGroupId = activeGroupIdRef.current;
        const now = Date.now();

        for (const [groupId, group] of groups) {
          if (groupId === currentActiveGroupId) continue; // never archive the active group

          // Check if all sessions in this group are idle
          const groupSessions = [...sessions.values()].filter(
            (s) => s.groupId === groupId,
          );
          if (groupSessions.some((s) => s.kind === "shell")) continue;
          const allIdle = groupSessions.every((s) => s.status === "idle");
          if (!allIdle) continue;

          // Skip groups that have any recently created sessions (not yet connected)
          const hasRecentSession = groupSessions.some(
            (s) => now - s.createdAt < RECENT_SESSION_MS,
          );
          if (hasRecentSession) continue;

          // Use same days-based threshold as sessions
          if (group.lastActivityAt < cutoff) {
            archiveGroup(groupId);
          }
        }
      } catch {
        // Non-critical — skip this cycle
      }
    }

    // Initial check after a short delay (let the page hydrate)
    const initialTimer = setTimeout(checkAndArchive, 5_000);
    timer = setInterval(checkAndArchive, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      if (timer) clearInterval(timer);
    };
  }, [sessions, archiveSession, groups, archiveGroup]);
}
