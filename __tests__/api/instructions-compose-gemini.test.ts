import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB module to avoid better-sqlite3
vi.mock("@/lib/db/instruction-files", () => ({
  getInstructionFile: vi.fn((id: string) => ({
    id,
    fileName: "test.md",
    filePath: "/tmp/test.md",
    content: "# Test content",
  })),
  getAIProviderKey: vi.fn(() => null),
}));

// Track which provider was used
let capturedProvider: string | undefined;

vi.mock("@/lib/instructions/ai-editor", () => ({
  composeWithAI: vi.fn(
    async (
      _sources: unknown[],
      _prompt: string,
      _mode: string,
      provider?: string,
    ) => {
      capturedProvider = provider;
      return {
        content: "# Composed result",
        tokensUsed: 100,
        cost: 0.001,
        editorType: provider === "google" ? "ai-google" : "ai-claude-cli",
      };
    },
  ),
}));

// Mock the DB layer so indexFile (called by compose route) runs harmlessly
// without touching real SQLite. Don't mock the indexer module itself — that
// contaminates indexer-utils.test.ts which needs the real exports.
vi.mock("@/lib/db/index", () => {
  const mockStmt = { run: vi.fn(), get: vi.fn(() => undefined), all: vi.fn(() => []) };
  return { getDb: () => ({ prepare: () => mockStmt, exec: vi.fn() }) };
});

import { POST } from "@/app/api/instructions/compose/route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/instructions/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/instructions/compose — provider routing", () => {
  beforeEach(() => {
    capturedProvider = undefined;
  });

  it("uses core runtime default path when no provider is specified", async () => {
    const req = makeRequest({
      sourceIds: ["file-1"],
      prompt: "Merge these files",
      outputPath: "/tmp/out",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(capturedProvider).toBeUndefined();
  });

  it("routes to google provider when provider=google", async () => {
    const req = makeRequest({
      sourceIds: ["file-1"],
      prompt: "Merge these files",
      provider: "google",
      outputPath: "/tmp/out",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(capturedProvider).toBe("google");
  });

  it("returns generated content in response", async () => {
    const req = makeRequest({
      sourceIds: ["file-1"],
      prompt: "Merge these files",
      provider: "google",
      outputPath: "/tmp/out",
    });
    const res = await POST(req);
    const data = await res.json();

    expect(data.content).toBe("# Composed result");
    expect(data.tokensUsed).toBe(100);
    expect(data.cost).toBe(0.001);
  });

  it("rejects request with no sourceIds", async () => {
    const req = makeRequest({
      sourceIds: [],
      prompt: "Merge",
      outputPath: "/tmp/out",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects request with no prompt", async () => {
    const req = makeRequest({
      sourceIds: ["file-1"],
      prompt: "",
      outputPath: "/tmp/out",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
