import { describe, it, expect } from "vitest";
import { isSystemSegment, isRootPath } from "@/lib/platform";

describe("isSystemSegment", () => {
  it("identifies Unix system dirs", () => {
    expect(isSystemSegment("Users")).toBe(true);
    expect(isSystemSegment("home")).toBe(true);
    expect(isSystemSegment("tmp")).toBe(true);
    expect(isSystemSegment("var")).toBe(true);
    expect(isSystemSegment("opt")).toBe(true);
    expect(isSystemSegment("usr")).toBe(true);
  });

  it("rejects normal directory names", () => {
    expect(isSystemSegment("projects")).toBe(false);
    expect(isSystemSegment("my-app")).toBe(false);
    expect(isSystemSegment("src")).toBe(false);
  });

  it("identifies Windows drive letters", () => {
    expect(isSystemSegment("C:")).toBe(true);
    expect(isSystemSegment("D:")).toBe(true);
    expect(isSystemSegment("C")).toBe(true);
    expect(isSystemSegment("D")).toBe(true);
  });

  it("rejects multi-char strings that look like dirs", () => {
    expect(isSystemSegment("CD")).toBe(false);
    expect(isSystemSegment("mydir")).toBe(false);
  });
});

describe("isRootPath", () => {
  it("handles Unix root", () => {
    expect(isRootPath("/")).toBe(true);
    expect(isRootPath("/Users")).toBe(false);
    expect(isRootPath("/home/user")).toBe(false);
  });
});
