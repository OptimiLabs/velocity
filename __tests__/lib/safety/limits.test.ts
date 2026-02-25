import { describe, it, expect, beforeEach } from "vitest";
import { SessionLimiter, SAFETY_LIMITS } from "@/lib/safety/limits";

type SessionLimiterInternals = SessionLimiter & {
  hourlyResetTime: number;
  activeSessions: Map<string, { startTime: number }>;
};

describe("SessionLimiter", () => {
  let limiter: SessionLimiter;

  beforeEach(() => {
    // skipPersistence avoids reading/writing the real SQLite DB in tests
    limiter = new SessionLimiter({ skipPersistence: true });
  });

  describe("canStartSession", () => {
    it("allows starting when under limit", () => {
      expect(limiter.canStartSession()).toEqual({ allowed: true });
    });

    it("denies when max concurrent sessions reached", () => {
      for (let i = 0; i < SAFETY_LIMITS.maxConcurrentSessions; i++) {
        limiter.startSession(`session-${i}`);
      }
      const result = limiter.canStartSession();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Max concurrent sessions");
    });

    it("allows after ending a session", () => {
      for (let i = 0; i < SAFETY_LIMITS.maxConcurrentSessions; i++) {
        limiter.startSession(`session-${i}`);
      }
      limiter.endSession("session-0");
      expect(limiter.canStartSession()).toEqual({ allowed: true });
    });
  });

  describe("addCost", () => {
    it("allows cost under per-session limit", () => {
      limiter.startSession("s1");
      const result = limiter.addCost("s1", 1.0);
      expect(result.allowed).toBe(true);
    });

    it("denies when per-session limit exceeded", () => {
      limiter.startSession("s1");
      const result = limiter.addCost("s1", SAFETY_LIMITS.maxCostPerSession);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Session cost limit");
    });

    it("accumulates cost across multiple calls", () => {
      limiter.startSession("s1");
      limiter.addCost("s1", SAFETY_LIMITS.maxCostPerSession - 1);
      const result = limiter.addCost("s1", 1.0);
      expect(result.allowed).toBe(false);
    });

    it("tracks hourly spend across sessions", () => {
      limiter.startSession("s1");
      limiter.addCost("s1", 1.0);
      limiter.endSession("s1");

      const stats = limiter.getStats();
      expect(stats.hourlySpend).toBe(1.0);
    });

    it("returns allowed for unknown session", () => {
      expect(limiter.addCost("nonexistent", 1.0)).toEqual({ allowed: true });
    });
  });

  describe("hourly reset", () => {
    it("resets hourly spend after 1 hour", () => {
      limiter.startSession("s1");
      limiter.addCost("s1", 10.0);
      limiter.endSession("s1");

      // Simulate time passing
      const l = limiter as SessionLimiterInternals;
      l.hourlyResetTime = Date.now() - 61 * 60 * 1000;

      const result = limiter.canStartSession();
      expect(result.allowed).toBe(true);
      expect(limiter.getStats().hourlySpend).toBe(0);
    });

    it("denies when hourly limit reached and not yet reset", () => {
      for (let i = 0; i < 4; i++) {
        limiter.startSession(`s${i}`);
        limiter.addCost(`s${i}`, SAFETY_LIMITS.maxCostPerHour / 4);
        limiter.endSession(`s${i}`);
      }
      const result = limiter.canStartSession();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Hourly spending limit");
    });
  });

  describe("session timeout cleanup", () => {
    it("cleans up timed-out sessions", () => {
      limiter.startSession("s1");
      const l = limiter as SessionLimiterInternals;
      l.activeSessions.get("s1").startTime =
        Date.now() - SAFETY_LIMITS.sessionTimeoutMs - 1000;

      expect(limiter.getStats().activeSessions).toBe(1);
      limiter.canStartSession();
      expect(limiter.getStats().activeSessions).toBe(0);
    });
  });

  describe("getStats", () => {
    it("returns current state", () => {
      limiter.startSession("s1");
      limiter.addCost("s1", 2.5);

      const stats = limiter.getStats();
      expect(stats.activeSessions).toBe(1);
      expect(stats.hourlySpend).toBe(2.5);
      expect(stats.limits).toBe(SAFETY_LIMITS);
    });
  });
});
