import { startOfDay, endOfDay, subDays, addDays, format } from "date-fns";
import type { DateRange } from "@/components/ui/date-range-picker";

/** Default 30-day date range ending today. */
export function getDefaultDateRange(): DateRange {
  return {
    from: startOfDay(subDays(new Date(), 30)),
    to: endOfDay(new Date()),
  };
}

/** Format a DateRange into ISO date strings for API queries.
 *  When both from/to are undefined ("All time"), uses 2020-01-01 as the lower bound. */
export function formatDateRange(range: DateRange): {
  from: string;
  to: string;
} {
  return {
    from: range.from
      ? format(range.from, "yyyy-MM-dd")
      : "2020-01-01",
    to: range.to
      ? format(range.to, "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
  };
}

/** Number of whole days between two ISO date strings. */
export function getDaysBetween(from: string, to: string): number {
  return Math.ceil(
    (new Date(to + "T00:00:00").getTime() -
      new Date(from + "T00:00:00").getTime()) /
      (1000 * 60 * 60 * 24),
  );
}

/**
 * Compute compare-period date strings.
 * If `compareStartDate` is given, the compare period starts there and spans the
 * same number of days as the primary range.  Otherwise falls back to the
 * immediately-preceding period of equal length.
 */
export function getCompareRange(
  from: string,
  daysBetween: number,
  compareStartDate: Date | null,
): { compareFrom: string; compareTo: string } {
  // `daysBetween` is an exclusive day difference (e.g. Jan 1 -> Jan 2 = 1),
  // while analytics ranges are inclusive on both ends.
  const inclusiveSpan = Math.max(daysBetween + 1, 1);

  if (compareStartDate) {
    return {
      compareFrom: format(compareStartDate, "yyyy-MM-dd"),
      compareTo: format(
        addDays(compareStartDate, inclusiveSpan - 1),
        "yyyy-MM-dd",
      ),
    };
  }
  const primaryStart = new Date(from + "T00:00:00");
  return {
    compareFrom: format(subDays(primaryStart, inclusiveSpan), "yyyy-MM-dd"),
    compareTo: format(subDays(primaryStart, 1), "yyyy-MM-dd"),
  };
}

/**
 * Determine which preset is active based on how far the compare start date is
 * from the primary start date.
 */
export function getActivePreset(
  from: string,
  compareStartDate: Date | null,
): "prev" | "-30d" | "-1yr" | "custom" {
  if (!compareStartDate) return "prev";
  const primaryStart = new Date(from + "T00:00");
  const diffDays = Math.round(
    (primaryStart.getTime() - compareStartDate.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (diffDays === 30) return "-30d";
  if (diffDays >= 364 && diffDays <= 366) return "-1yr";
  return "custom";
}

/**
 * Sort primary and compare ranges so the older period is always "A".
 * Returns the two period objects and whether the primary range ended up as A.
 */
export function getOrderedPeriods(
  from: string,
  to: string,
  compareFrom: string,
  compareTo: string,
): {
  periodA: { from: string; to: string };
  periodB: { from: string; to: string };
  primaryIsA: boolean;
} {
  const pStart = new Date(from + "T00:00");
  const cStart = new Date(compareFrom + "T00:00");
  if (pStart <= cStart) {
    return {
      periodA: { from, to },
      periodB: { from: compareFrom, to: compareTo },
      primaryIsA: true,
    };
  }
  return {
    periodA: { from: compareFrom, to: compareTo },
    periodB: { from, to },
    primaryIsA: false,
  };
}

/** Format a date string like "2025-01-15" to "Jan 15". */
export function formatPeriodDate(dateStr: string): string {
  return format(new Date(dateStr + "T00:00"), "MMM d");
}
