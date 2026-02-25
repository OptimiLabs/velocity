import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import { deriveProjectPath } from "@/lib/parser/indexer";

const DIRECTORY_STAT: Pick<fs.Stats, "isDirectory"> = {
  isDirectory: () => true,
};

describe("deriveProjectPath", () => {
  // deriveProjectPath resolves ambiguous dash-encoded directory names by
  // checking the filesystem for real directories. We mock fs.statSync to
  // control which paths are "real directories".

  let statSyncSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    statSyncSpy?.mockRestore();
  });

  it("resolves simple path without hyphens in components", () => {
    // "-Users-jaelee-projects-myapp" → "/Users/jaelee/projects/myapp"
    statSyncSpy = vi
      .spyOn(fs, "statSync")
      .mockImplementation((p: Parameters<typeof fs.statSync>[0]) => {
      const validDirs = [
        "/Users",
        "/Users/jaelee",
        "/Users/jaelee/projects",
        "/Users/jaelee/projects/myapp",
      ];
      if (validDirs.includes(String(p))) {
        return DIRECTORY_STAT as fs.Stats;
      }
      throw new Error("ENOENT");
    });

    expect(deriveProjectPath("-Users-jaelee-projects-myapp")).toBe(
      "/Users/jaelee/projects/myapp",
    );
  });

  it("resolves path with hyphens in component names", () => {
    // "-Users-jaelee-side-projects-claude-best"
    // should resolve to "/Users/jaelee/side-projects/claude-best"
    statSyncSpy = vi
      .spyOn(fs, "statSync")
      .mockImplementation((p: Parameters<typeof fs.statSync>[0]) => {
        const validDirs = [
          "/Users",
          "/Users/jaelee",
          "/Users/jaelee/side-projects",
          "/Users/jaelee/side-projects/claude-best",
        ];
        if (validDirs.includes(String(p))) {
          return DIRECTORY_STAT as fs.Stats;
        }
        throw new Error("ENOENT");
      });

    expect(deriveProjectPath("-Users-jaelee-side-projects-claude-best")).toBe(
      "/Users/jaelee/side-projects/claude-best",
    );
  });

  it("returns null for empty input", () => {
    statSyncSpy = vi.spyOn(fs, "statSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(deriveProjectPath("-")).toBeNull();
  });

  it("resolves path where multiple hyphens exist in a single component", () => {
    // "-Users-dev-my-very-long-name" → "/Users/dev/my-very-long-name"
    statSyncSpy = vi
      .spyOn(fs, "statSync")
      .mockImplementation((p: Parameters<typeof fs.statSync>[0]) => {
        const validDirs = [
          "/Users",
          "/Users/dev",
          "/Users/dev/my-very-long-name",
        ];
        if (validDirs.includes(String(p))) {
          return DIRECTORY_STAT as fs.Stats;
        }
        throw new Error("ENOENT");
      });

    expect(deriveProjectPath("-Users-dev-my-very-long-name")).toBe(
      "/Users/dev/my-very-long-name",
    );
  });

  it("returns null when no valid directory combination exists", () => {
    statSyncSpy = vi.spyOn(fs, "statSync").mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(deriveProjectPath("-nonexistent-path-here")).toBeNull();
  });

  it("resolves single segment path", () => {
    // "-tmp" → "/tmp" if /tmp is a directory
    statSyncSpy = vi
      .spyOn(fs, "statSync")
      .mockImplementation((p: Parameters<typeof fs.statSync>[0]) => {
        if (String(p) === "/tmp") {
          return DIRECTORY_STAT as fs.Stats;
        }
        throw new Error("ENOENT");
      });

    expect(deriveProjectPath("-tmp")).toBe("/tmp");
  });
});
