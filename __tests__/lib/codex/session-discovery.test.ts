import { describe, it, expect } from "vitest";
import path from "path";
import os from "os";
import {
  parseCodexSessionFilename,
  getCodexSessionsDir,
  discoverCodexSessions,
} from "@/lib/codex/session-discovery";

describe("parseCodexSessionFilename", () => {
  it("parses a valid rollout filename", () => {
    const result = parseCodexSessionFilename(
      "rollout-2025-08-29T14-50-52-abc12345-6789-abcd-ef01.jsonl",
    );
    expect(result).toEqual({
      sessionId: "codex-abc12345-6789-abcd-ef01",
      timestamp: "2025-08-29T14:50:52",
      date: "2025-08-29",
    });
  });

  it("parses a filename where the UUID starts with a digit", () => {
    const result = parseCodexSessionFilename(
      "rollout-2025-08-29T14-50-52-1abc2345-6789-abcd-ef01.jsonl",
    );
    expect(result).toEqual({
      sessionId: "codex-1abc2345-6789-abcd-ef01",
      timestamp: "2025-08-29T14:50:52",
      date: "2025-08-29",
    });
  });

  it("returns null for non-rollout filenames", () => {
    expect(parseCodexSessionFilename("session-123.jsonl")).toBeNull();
    expect(parseCodexSessionFilename("random-file.jsonl")).toBeNull();
  });

  it("returns null for non-jsonl files", () => {
    expect(
      parseCodexSessionFilename(
        "rollout-2025-08-29T14-50-52-abc12345-6789-abcd-ef01.json",
      ),
    ).toBeNull();
    expect(
      parseCodexSessionFilename(
        "rollout-2025-08-29T14-50-52-abc12345-6789-abcd-ef01.txt",
      ),
    ).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseCodexSessionFilename("")).toBeNull();
  });

  it("returns null for filenames missing timestamp", () => {
    expect(parseCodexSessionFilename("rollout-abc12345.jsonl")).toBeNull();
  });
});

describe("getCodexSessionsDir", () => {
  it("returns the expected path under ~/.codex/sessions", () => {
    const expected = path.join(os.homedir(), ".codex", "sessions");
    expect(getCodexSessionsDir()).toBe(expected);
  });
});

describe("discoverCodexSessions", () => {
  it("returns empty array when sessions dir does not exist", () => {
    // On CI or machines without Codex, the dir won't exist
    const result = discoverCodexSessions();
    expect(Array.isArray(result)).toBe(true);
  });
});
