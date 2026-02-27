import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("gemini/session-discovery", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gemini-sess-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("parseGeminiSessionFilename", () => {
    it("parses session-<name>.json", async () => {
      const { parseGeminiSessionFilename } =
        await import("@/lib/gemini/session-discovery");
      expect(parseGeminiSessionFilename("session-my-chat.json")).toEqual({
        sessionName: "my-chat",
      });
    });

    it("returns null for non-session files", async () => {
      const { parseGeminiSessionFilename } =
        await import("@/lib/gemini/session-discovery");
      expect(parseGeminiSessionFilename("config.json")).toBeNull();
      expect(parseGeminiSessionFilename("session-.txt")).toBeNull();
      expect(parseGeminiSessionFilename("random-file")).toBeNull();
    });
  });

  describe("getGeminiSessionsBaseDir", () => {
    it("returns ~/.gemini/tmp", async () => {
      const { getGeminiSessionsBaseDir } =
        await import("@/lib/gemini/session-discovery");
      const { GEMINI_TMP_DIR } = await import("@/lib/gemini/paths");
      expect(getGeminiSessionsBaseDir()).toBe(GEMINI_TMP_DIR);
    });
  });

  describe("discoverGeminiSessionsFrom", () => {
    it("finds sessions in <hash>/chats/ directories", async () => {
      const hash = "abc123";
      const chatsDir = join(dir, hash, "chats");
      mkdirSync(chatsDir, { recursive: true });
      writeFileSync(
        join(chatsDir, "session-hello.json"),
        JSON.stringify({ messages: [] }),
      );

      const { discoverGeminiSessionsFrom } =
        await import("@/lib/gemini/session-discovery");
      const sessions = discoverGeminiSessionsFrom(dir);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionName).toBe("hello");
      expect(sessions[0].projectHash).toBe("abc123");
      expect(sessions[0].filePath).toBe(join(chatsDir, "session-hello.json"));
      expect(sessions[0].createdAt).toBeDefined();
      expect(sessions[0].modifiedAt).toBeDefined();
      expect(sessions[0].projectPath).toBeNull();
    });

    it("reads project path from .project_root marker when available", async () => {
      const hash = "abc123";
      const hashDir = join(dir, hash);
      const chatsDir = join(hashDir, "chats");
      mkdirSync(chatsDir, { recursive: true });
      writeFileSync(join(hashDir, ".project_root"), "/Users/test/project-a");
      writeFileSync(
        join(chatsDir, "session-hello.json"),
        JSON.stringify({ messages: [] }),
      );

      const { discoverGeminiSessionsFrom } =
        await import("@/lib/gemini/session-discovery");
      const sessions = discoverGeminiSessionsFrom(dir);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].projectPath).toBe("/Users/test/project-a");
    });

    it("handles multiple project hashes", async () => {
      for (const hash of ["hash1", "hash2"]) {
        const chatsDir = join(dir, hash, "chats");
        mkdirSync(chatsDir, { recursive: true });
        writeFileSync(join(chatsDir, "session-chat.json"), JSON.stringify({}));
      }

      const { discoverGeminiSessionsFrom } =
        await import("@/lib/gemini/session-discovery");
      const sessions = discoverGeminiSessionsFrom(dir);
      expect(sessions).toHaveLength(2);
      const hashes = sessions.map((s) => s.projectHash).sort();
      expect(hashes).toEqual(["hash1", "hash2"]);
    });

    it("skips non-session files", async () => {
      const chatsDir = join(dir, "hash1", "chats");
      mkdirSync(chatsDir, { recursive: true });
      writeFileSync(join(chatsDir, "session-valid.json"), "{}");
      writeFileSync(join(chatsDir, "config.json"), "{}");
      writeFileSync(join(chatsDir, "notes.txt"), "hello");

      const { discoverGeminiSessionsFrom } =
        await import("@/lib/gemini/session-discovery");
      const sessions = discoverGeminiSessionsFrom(dir);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionName).toBe("valid");
    });

    it("returns empty for empty directory", async () => {
      const { discoverGeminiSessionsFrom } =
        await import("@/lib/gemini/session-discovery");
      const sessions = discoverGeminiSessionsFrom(dir);
      expect(sessions).toEqual([]);
    });

    it("returns empty for missing directory", async () => {
      const { discoverGeminiSessionsFrom } =
        await import("@/lib/gemini/session-discovery");
      const sessions = discoverGeminiSessionsFrom(join(dir, "nonexistent"));
      expect(sessions).toEqual([]);
    });
  });
});
