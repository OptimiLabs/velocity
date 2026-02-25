export const SAFETY_LIMITS = {
  maxConcurrentSessions: 5,
  maxCostPerSession: 5.0, // $5
  maxCostPerHour: 20.0, // $20
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
} as const;
