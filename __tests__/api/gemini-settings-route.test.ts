import { beforeEach, describe, it, expect, vi } from "vitest";

let geminiSettingsState: Record<string, unknown> = {};

// Mock codex settings (route imports both providers)
vi.mock("@/lib/codex/settings", () => ({
  readCodexSettings: vi.fn(() => ({})),
  writeCodexSettings: vi.fn(),
}));

// Mock gemini settings
vi.mock("@/lib/gemini/settings", () => ({
  readGeminiSettings: vi.fn(() => geminiSettingsState),
  writeGeminiSettings: vi.fn((next: Record<string, unknown>) => {
    geminiSettingsState = next;
  }),
}));

// Mock claude settings
vi.mock("@/lib/claude-settings", () => ({
  readSettings: vi.fn(() => ({})),
  writeSettings: vi.fn(),
  readProjectSettings: vi.fn(() => ({})),
  writeProjectSettings: vi.fn(),
}));

// Use the real validateHookConfig — no mock needed since the settings route
// only calls it during PUT with hooks, and our test payloads don't trigger it.
// Mocking it globally would contaminate other test files that verify its behavior.

import { GET, PUT } from "@/app/api/settings/route";

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

beforeEach(() => {
  geminiSettingsState = {};
});

describe("GET /api/settings — provider dispatch", () => {
  it("returns 200 with JSON for provider=gemini", async () => {
    const req = makeRequest("http://localhost/api/settings?provider=gemini");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    // Should return an object (the gemini config from disk)
    expect(typeof data).toBe("object");
    expect(data).not.toHaveProperty("error");
  });

  it("returns 400 for unknown provider", async () => {
    const req = makeRequest("http://localhost/api/settings?provider=unknown");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Unknown provider");
  });

  it("returns 200 for provider=codex", async () => {
    const req = makeRequest("http://localhost/api/settings?provider=codex");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/settings — provider dispatch", () => {
  it("returns success for provider=gemini with valid body", async () => {
    const req = makeRequest("http://localhost/api/settings?provider=gemini", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gemini-2.5-pro" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("performs shallow merge on gemini settings", async () => {
    // Write a known value first
    const putReq1 = makeRequest(
      "http://localhost/api/settings?provider=gemini",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testKey: "initial",
          nested: { a: 1 },
        }),
      },
    );
    await PUT(putReq1);

    // Now merge a partial update
    const putReq2 = makeRequest(
      "http://localhost/api/settings?provider=gemini",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nested: { b: 2 } }),
      },
    );
    await PUT(putReq2);

    // Read back and verify merge: testKey preserved, nested replaced (shallow)
    const getReq = makeRequest("http://localhost/api/settings?provider=gemini");
    const res = await GET(getReq);
    const data = await res.json();

    expect(data.testKey).toBe("initial");
    // Shallow merge replaces nested entirely
    expect(data.nested).toEqual({ b: 2 });
  });

  it("returns 400 for unknown provider on PUT", async () => {
    const req = makeRequest("http://localhost/api/settings?provider=bogus", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });
});
