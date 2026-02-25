import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const aiGenerateMock = vi.fn<(...args: unknown[]) => Promise<string>>();
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
  SECURITY_SYSTEM_PROMPT_REPO: "test-system",
}));

describe("POST /api/marketplace/analyze-repo", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    aiGenerateMock.mockReset();
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

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uses the repository default branch when resolving files", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/acme/repo") {
        return Response.json({ default_branch: "trunk" }, { status: 200 });
      }
      if (url.includes("/acme/repo/trunk/README.md")) {
        return new Response("# README", { status: 200 });
      }
      return new Response("", { status: 404 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { POST } = await import("@/app/api/marketplace/analyze-repo/route");
    const req = new Request("http://localhost/api/marketplace/analyze-repo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "acme", repo: "repo" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/acme/repo/trunk/README.md"))).toBe(true);
    expect(detectSecuritySignalsMock).toHaveBeenCalledTimes(1);
    expect(formatFindingsForPromptMock).toHaveBeenCalledTimes(1);
    expect(combineSecurityAnalysisMock).toHaveBeenCalledTimes(1);
    expect(aiGenerateMock).toHaveBeenCalledWith(
      expect.stringContaining("<deterministic-signal-scan>"),
      expect.any(Object),
    );
  });

  it("falls back to master when repo metadata lookup fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/acme/repo") {
        return new Response("", { status: 500 });
      }
      if (url.includes("/acme/repo/main/")) return new Response("", { status: 404 });
      if (url.includes("/acme/repo/master/package.json")) {
        return new Response('{"name":"repo"}', { status: 200 });
      }
      return new Response("", { status: 404 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { POST } = await import("@/app/api/marketplace/analyze-repo/route");
    const req = new Request("http://localhost/api/marketplace/analyze-repo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "acme", repo: "repo" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/acme/repo/main/README.md"))).toBe(true);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/acme/repo/master/package.json"))).toBe(true);
  });
});
