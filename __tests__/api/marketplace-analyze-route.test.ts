import { beforeEach, describe, expect, it, vi } from "vitest";

const aiGenerateMock = vi.fn<(...args: unknown[]) => Promise<string>>();
const fetchWithTimeoutMock = vi.fn<(url: string) => Promise<Response>>();
const getCachedMock = vi.fn<(key: string) => unknown>();
const setCacheMock = vi.fn<(key: string, value: unknown) => void>();
const parseAnalysisResponseMock = vi.fn<(raw: string) => unknown>();
const detectSecuritySignalsMock = vi.fn<(content: string) => unknown[]>();
const combineSecurityAnalysisMock = vi.fn<
  (aiResult: unknown, deterministicFindings: unknown[]) => unknown
>();
const formatFindingsForPromptMock = vi.fn<(findings: unknown[]) => string>();

vi.mock("@/lib/ai/generate", () => ({
  aiGenerate: aiGenerateMock,
}));

vi.mock("@/lib/marketplace/security-analysis", () => ({
  getCached: getCachedMock,
  setCache: setCacheMock,
  detectSecuritySignals: detectSecuritySignalsMock,
  combineSecurityAnalysis: combineSecurityAnalysisMock,
  formatFindingsForPrompt: formatFindingsForPromptMock,
  parseAnalysisResponse: parseAnalysisResponseMock,
  SECURITY_SYSTEM_PROMPT_PLUGIN: "test-system",
}));

vi.mock("@/lib/marketplace/fetch-utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/marketplace/fetch-utils")>(
    "@/lib/marketplace/fetch-utils",
  );
  return {
    ...actual,
    fetchWithTimeout: fetchWithTimeoutMock,
  };
});

describe("POST /api/marketplace/analyze", () => {
  beforeEach(() => {
    aiGenerateMock.mockReset();
    fetchWithTimeoutMock.mockReset();
    getCachedMock.mockReset();
    setCacheMock.mockReset();
    parseAnalysisResponseMock.mockReset();
    detectSecuritySignalsMock.mockReset();
    combineSecurityAnalysisMock.mockReset();
    formatFindingsForPromptMock.mockReset();

    getCachedMock.mockReturnValue(null);
    aiGenerateMock.mockResolvedValue("{}");
    const parsed = {
      overallRisk: "low",
      findings: [],
      summary: "ok",
    };
    parseAnalysisResponseMock.mockReturnValue(parsed);
    detectSecuritySignalsMock.mockReturnValue([]);
    combineSecurityAnalysisMock.mockImplementation((result) => result);
    formatFindingsForPromptMock.mockReturnValue(
      "- No deterministic red flags detected in sampled content.",
    );
  });

  it("uses the provided default branch for plain GitHub repo URLs", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url) => {
      if (url.includes("/repo/master/package.json")) {
        return new Response('{"name":"repo"}', { status: 200 });
      }
      if (url.includes("/repo/master/README.md")) {
        return new Response("# README", { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    const { POST } = await import("@/app/api/marketplace/analyze/route");
    const req = new Request("http://localhost/api/marketplace/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "plugin",
        url: "https://github.com/acme/repo",
        name: "repo",
        defaultBranch: "master",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fetchWithTimeoutMock.mock.calls.some(([u]) => u.includes("/repo/master/package.json"))).toBe(true);
    expect(fetchWithTimeoutMock.mock.calls.some(([u]) => u.includes("/repo/main/package.json"))).toBe(false);
    expect(detectSecuritySignalsMock).toHaveBeenCalledTimes(1);
    expect(formatFindingsForPromptMock).toHaveBeenCalledTimes(1);
    expect(combineSecurityAnalysisMock).toHaveBeenCalledTimes(1);
    expect(aiGenerateMock).toHaveBeenCalledWith(
      expect.stringContaining("<deterministic-signal-scan>"),
      expect.any(Object),
    );
  });

  it("falls back from main to master for plain GitHub repo URLs", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url) => {
      if (url.includes("/repo/main/")) return new Response("", { status: 404 });
      if (url.includes("/repo/master/README.md")) {
        return new Response("# README", { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    const { POST } = await import("@/app/api/marketplace/analyze/route");
    const req = new Request("http://localhost/api/marketplace/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "plugin",
        url: "https://github.com/acme/repo",
        name: "repo",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fetchWithTimeoutMock.mock.calls.some(([u]) => u.includes("/repo/main/package.json"))).toBe(true);
    expect(fetchWithTimeoutMock.mock.calls.some(([u]) => u.includes("/repo/master/README.md"))).toBe(true);
  });

  it("handles blob file URLs without appending filenames twice", async () => {
    fetchWithTimeoutMock.mockImplementation(async (url) => {
      if (url === "https://raw.githubusercontent.com/acme/repo/main/package.json") {
        return new Response('{"name":"repo"}', { status: 200 });
      }
      if (url === "https://raw.githubusercontent.com/acme/repo/main/README.md") {
        return new Response("# README", { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    const { POST } = await import("@/app/api/marketplace/analyze/route");
    const req = new Request("http://localhost/api/marketplace/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "mcp-server",
        url: "https://github.com/acme/repo/blob/main/package.json",
        name: "repo",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(
      fetchWithTimeoutMock.mock.calls.some(
        ([u]) => u === "https://raw.githubusercontent.com/acme/repo/main/package.json",
      ),
    ).toBe(true);
    expect(
      fetchWithTimeoutMock.mock.calls.some(([u]) =>
        u.includes("/package.json/package.json"),
      ),
    ).toBe(false);
  });

  it("returns a clear 422 for non-HTTP URLs", async () => {
    const { POST } = await import("@/app/api/marketplace/analyze/route");
    const req = new Request("http://localhost/api/marketplace/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "hook",
        url: "builtin://hooks/lint-on-edit",
        name: "lint-on-edit",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: "Only remote HTTP(S) plugin URLs can be analyzed",
    });
    expect(fetchWithTimeoutMock).not.toHaveBeenCalled();
    expect(aiGenerateMock).not.toHaveBeenCalled();
  });
});
