import { startOfDay, subDays, addDays } from "date-fns";

export function computeWeekBounds(
  weekStartDay: number,
  weekStartHour: number,
  nowInput?: Date,
) {
  const now = nowInput ? new Date(nowInput) : new Date();
  const daysAgo = (now.getDay() - weekStartDay + 7) % 7;
  const candidate = startOfDay(subDays(now, daysAgo));
  candidate.setHours(weekStartHour);
  // If we haven't reached the reset hour yet today, go back one more week
  if (candidate > now) {
    candidate.setDate(candidate.getDate() - 7);
  }
  const weekStart = candidate;
  const nextReset = addDays(weekStart, 7);
  return {
    weekFrom: weekStart.toISOString(),
    weekTo: nextReset.toISOString(),
    weekStartDate: weekStart,
    weekEndDate: nextReset,
    nextResetDate: nextReset,
  };
}
