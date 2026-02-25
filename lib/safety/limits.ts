// Re-export for backwards compatibility (server-side consumers)
export { SAFETY_LIMITS } from "./constants";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { SAFETY_LIMITS } from "./constants";

interface ActiveSession {
  startTime: number;
  cost: number;
}

/**
 * Persist/load safety state from SQLite so cost limits survive server restarts.
 * Falls back gracefully if DB is unavailable (e.g. during tests).
 */
function loadSafetyState(): { hourlySpend: number; hourlyResetTime: number } {
  try {
    const dbPath = path.join(os.homedir(), ".claude", "dashboard.db");
    if (!fs.existsSync(dbPath))
      return { hourlySpend: 0, hourlyResetTime: Date.now() };

    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db
        .prepare("SELECT value FROM index_metadata WHERE key = 'safety_state'")
        .get() as { value: string } | undefined;
      if (row) {
        const state = JSON.parse(row.value);
        return {
          hourlySpend: state.hourlySpend ?? 0,
          hourlyResetTime: state.hourlyResetTime ?? Date.now(),
        };
      }
    } finally {
      db.close();
    }
  } catch {
    // DB unavailable or no table — start fresh
  }
  return { hourlySpend: 0, hourlyResetTime: Date.now() };
}

function saveSafetyState(hourlySpend: number, hourlyResetTime: number): void {
  try {
    const dbPath = path.join(os.homedir(), ".claude", "dashboard.db");
    if (!fs.existsSync(dbPath)) return;

    const db = new Database(dbPath);
    try {
      db.prepare(
        "INSERT OR REPLACE INTO index_metadata (key, value) VALUES ('safety_state', ?)",
      ).run(JSON.stringify({ hourlySpend, hourlyResetTime }));
    } finally {
      db.close();
    }
  } catch {
    // Non-critical — limits still enforced in memory
  }
}

export class SessionLimiter {
  private activeSessions = new Map<string, ActiveSession>();
  private hourlySpend: number;
  private hourlyResetTime: number;

  constructor(opts?: { skipPersistence?: boolean }) {
    if (opts?.skipPersistence) {
      this.hourlySpend = 0;
      this.hourlyResetTime = Date.now();
    } else {
      const state = loadSafetyState();
      this.hourlySpend = state.hourlySpend;
      this.hourlyResetTime = state.hourlyResetTime;
    }
  }

  canStartSession(): { allowed: boolean; reason?: string } {
    // Clean up timed-out sessions
    this.cleanupTimedOut();

    if (this.activeSessions.size >= SAFETY_LIMITS.maxConcurrentSessions) {
      return {
        allowed: false,
        reason: `Max concurrent sessions reached (${SAFETY_LIMITS.maxConcurrentSessions})`,
      };
    }

    this.resetHourlyIfNeeded();

    if (this.hourlySpend >= SAFETY_LIMITS.maxCostPerHour) {
      return {
        allowed: false,
        reason: `Hourly spending limit reached ($${SAFETY_LIMITS.maxCostPerHour})`,
      };
    }

    return { allowed: true };
  }

  startSession(id: string) {
    this.activeSessions.set(id, { startTime: Date.now(), cost: 0 });
  }

  endSession(id: string) {
    this.activeSessions.delete(id);
  }

  addCost(id: string, cost: number): { allowed: boolean; reason?: string } {
    const session = this.activeSessions.get(id);
    if (!session) return { allowed: true };

    session.cost += cost;
    this.hourlySpend += cost;
    saveSafetyState(this.hourlySpend, this.hourlyResetTime);

    if (session.cost >= SAFETY_LIMITS.maxCostPerSession) {
      return {
        allowed: false,
        reason: `Session cost limit reached ($${SAFETY_LIMITS.maxCostPerSession})`,
      };
    }

    return { allowed: true };
  }

  getStats() {
    return {
      activeSessions: this.activeSessions.size,
      hourlySpend: this.hourlySpend,
      limits: SAFETY_LIMITS,
    };
  }

  private cleanupTimedOut() {
    const now = Date.now();
    for (const [id, session] of this.activeSessions) {
      if (now - session.startTime > SAFETY_LIMITS.sessionTimeoutMs) {
        this.activeSessions.delete(id);
      }
    }
  }

  private resetHourlyIfNeeded() {
    if (Date.now() - this.hourlyResetTime > 60 * 60 * 1000) {
      this.hourlySpend = 0;
      this.hourlyResetTime = Date.now();
      saveSafetyState(this.hourlySpend, this.hourlyResetTime);
    }
  }
}

// Singleton
