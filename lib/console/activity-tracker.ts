/**
 * Fire-and-forget activity timestamp tracking for console sessions.
 * Updates SQLite via API, with a local fallback map so auto-archive
 * doesn't trigger prematurely due to stale lastActivityAt values.
 */

const lastActivityFallback = new Map<string, number>();

/**
 * Record last activity timestamp for a session.
 * Sends to SQLite via API and keeps a local fallback on failure.
 */
export function trackActivity(sessionId: string): void {
  const now = Date.now();
  lastActivityFallback.set(sessionId, now);
  fetch("/api/console-sessions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: sessionId, lastActivityAt: now }),
  }).catch((err) => {
    console.error("[CONSOLE] trackActivity failed:", err.message);
    // Keep the local fallback fresh so auto-archive sees recent activity
    lastActivityFallback.set(sessionId, Date.now());
  });
}

/**
 * Retrieve last activity time from the local fallback map.
 */
export function getLastActivity(sessionId: string): number | undefined {
  return lastActivityFallback.get(sessionId);
}

/**
 * Remove activity tracking for a session.
 */
export function deleteActivity(sessionId: string): void {
  lastActivityFallback.delete(sessionId);
}
