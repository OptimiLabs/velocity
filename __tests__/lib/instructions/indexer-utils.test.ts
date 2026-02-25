import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

/**
 * The pure utility functions in lib/instructions/indexer.ts (classifyFileType,
 * estimateTokens, computeHash, extractTitle) are not exported. We test their
 * behavior indirectly through the exported `indexFile` function, which uses
 * all four internally.
 *
 * Since indexFile requires DB access, we mock getDb to provide a stub.
 */

// Mock the DB module before importing the module under test
const mockPrepare = vi.fn();
const mockDb = {
  prepare: mockPrepare,
};

vi.mock("@/lib/db/index", () => ({
  getDb: () => mockDb,
}));

const mockLogger = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

vi.mock("@/lib/logger", () => ({
  mcpLog: mockLogger(),
  ptyLog: mockLogger(),
  wsLog: mockLogger(),
  dbLog: mockLogger(),
  indexerLog: mockLogger(),
  consoleLog: mockLogger(),
  watcherLog: mockLogger(),
  routingLog: mockLogger(),
  apiLog: mockLogger(),
  aiLog: mockLogger(),
  skillLog: mockLogger(),
  cleanupLog: mockLogger(),
}));

// Must import AFTER mocks are set up
const { indexFile } = await import("@/lib/instructions/indexer");

describe("indexFile — file type classification and content processing", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "indexer-test-"));
    // Reset mock state
    mockPrepare.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupDbForNewFile() {
    // prepare("SELECT ... WHERE file_path = ?").get() → undefined (file not indexed yet)
    const selectStmt = { get: vi.fn().mockReturnValue(undefined) };
    // prepare("INSERT INTO instruction_files ...").run()
    const insertStmt = { run: vi.fn() };

    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes("SELECT")) return selectStmt;
      if (sql.includes("INSERT")) return insertStmt;
      return { run: vi.fn(), get: vi.fn() };
    });

    return { selectStmt, insertStmt };
  }

  it("classifies CLAUDE.md file type correctly", () => {
    const filePath = path.join(tmpDir, "CLAUDE.md");
    fs.writeFileSync(filePath, "# Project\nSome instructions");

    const { insertStmt } = setupDbForNewFile();
    indexFile(filePath, null, null);

    // The file_type argument (4th positional in INSERT) should be "CLAUDE.md"
    expect(insertStmt.run).toHaveBeenCalled();
    const args = insertStmt.run.mock.calls[0];
    // args[2] is file_type
    expect(args[2]).toBe("CLAUDE.md");
  });

  it("classifies files in commands/ directory as skill.md", () => {
    const commandsDir = path.join(tmpDir, "commands");
    fs.mkdirSync(commandsDir, { recursive: true });
    const filePath = path.join(commandsDir, "review.md");
    fs.writeFileSync(filePath, "Review the code");

    const { insertStmt } = setupDbForNewFile();
    indexFile(filePath, null, null);

    expect(insertStmt.run).toHaveBeenCalled();
    const args = insertStmt.run.mock.calls[0];
    expect(args[2]).toBe("skill.md");
  });

  it("classifies SKILL.md as skill.md", () => {
    const skillDir = path.join(tmpDir, "skills", "test-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    const filePath = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(filePath, "A test skill");

    const { insertStmt } = setupDbForNewFile();
    indexFile(filePath, null, null);

    expect(insertStmt.run).toHaveBeenCalled();
    const args = insertStmt.run.mock.calls[0];
    expect(args[2]).toBe("skill.md");
  });

  it("classifies generic .md files as other.md", () => {
    const filePath = path.join(tmpDir, "notes.md");
    fs.writeFileSync(filePath, "Some notes");

    const { insertStmt } = setupDbForNewFile();
    indexFile(filePath, null, null);

    expect(insertStmt.run).toHaveBeenCalled();
    const args = insertStmt.run.mock.calls[0];
    expect(args[2]).toBe("other.md");
  });

  it("uses explicit fileType parameter when provided", () => {
    const filePath = path.join(tmpDir, "custom.md");
    fs.writeFileSync(filePath, "Custom file");

    const { insertStmt } = setupDbForNewFile();
    indexFile(filePath, null, null, "agents.md");

    expect(insertStmt.run).toHaveBeenCalled();
    const args = insertStmt.run.mock.calls[0];
    expect(args[2]).toBe("agents.md");
  });

  it("estimates tokens as roughly content.length / 4", () => {
    const content = "x".repeat(400); // 400 chars → ~100 tokens
    const filePath = path.join(tmpDir, "tokens.md");
    fs.writeFileSync(filePath, content);

    const { insertStmt } = setupDbForNewFile();
    indexFile(filePath, null, null);

    expect(insertStmt.run).toHaveBeenCalled();
    const args = insertStmt.run.mock.calls[0];
    // token_count is args[8]
    expect(args[8]).toBe(100);
  });

  it("computes SHA-256 hash of content", () => {
    const content = "Hello, world!";
    const expectedHash = crypto
      .createHash("sha256")
      .update(content)
      .digest("hex");
    const filePath = path.join(tmpDir, "hash.md");
    fs.writeFileSync(filePath, content);

    const { insertStmt } = setupDbForNewFile();
    indexFile(filePath, null, null);

    expect(insertStmt.run).toHaveBeenCalled();
    const args = insertStmt.run.mock.calls[0];
    // content_hash is args[7]
    expect(args[7]).toBe(expectedHash);
  });

  it("returns false for non-existent file", () => {
    const result = indexFile("/nonexistent/file.md", null, null);
    expect(result).toBe(false);
  });

  it("returns false when file mtime has not changed (already indexed)", () => {
    const filePath = path.join(tmpDir, "cached.md");
    fs.writeFileSync(filePath, "Cached content");
    const stat = fs.statSync(filePath);

    // Simulate existing entry with same mtime
    const selectStmt = {
      get: vi.fn().mockReturnValue({
        id: "existing-id",
        file_mtime: stat.mtime.toISOString(),
        content_hash: "abc",
        project_id: null,
      }),
    };
    mockPrepare.mockReturnValue(selectStmt);

    const result = indexFile(filePath, null, null);
    expect(result).toBe(false);
  });
});
