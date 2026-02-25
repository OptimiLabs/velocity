import { describe, expect, it } from "vitest";
import {
  getMarketplaceInstallNameCandidates,
  normalizeMarketplaceInstallName,
} from "@/lib/marketplace/install-names";

describe("marketplace install names", () => {
  it("normalizes names to safe lowercase path segments", () => {
    expect(normalizeMarketplaceInstallName("  My Skill / V2  ")).toBe(
      "my-skill-v2",
    );
  });

  it("provides legacy + normalized candidates for robust lookup", () => {
    expect(getMarketplaceInstallNameCandidates("My Skill")).toEqual([
      "My Skill",
      "My-Skill",
      "my-skill",
    ]);
  });
});
