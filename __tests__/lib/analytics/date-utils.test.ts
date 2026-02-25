import { describe, it, expect } from "vitest";
import { getCompareRange } from "@/lib/analytics/date-utils";

describe("analytics date utils", () => {
  it("uses an inclusive span for previous-period compare ranges", () => {
    const range = getCompareRange("2025-01-02", 1, null);
    expect(range).toEqual({
      compareFrom: "2024-12-31",
      compareTo: "2025-01-01",
    });
  });

  it("uses an inclusive span for custom compare start dates", () => {
    const range = getCompareRange("2025-01-02", 1, new Date("2024-12-15T00:00:00"));
    expect(range).toEqual({
      compareFrom: "2024-12-15",
      compareTo: "2024-12-16",
    });
  });

  it("keeps one-day ranges aligned to one-day compare windows", () => {
    const range = getCompareRange("2025-01-02", 0, null);
    expect(range).toEqual({
      compareFrom: "2025-01-01",
      compareTo: "2025-01-01",
    });
  });
});
