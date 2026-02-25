import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAgentLaunch } from "@/hooks/useAgentLaunch";

function mockJsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: async () => data,
  } as Response;
}

describe("useAgentLaunch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.history.replaceState({}, "", "/");
  });

  it("launches provider-scoped project agent from URL params", async () => {
    window.history.pushState(
      {},
      "",
      "/?agent=builder&provider=codex&projectPath=%2Frepo%2Fapp",
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agents?provider=codex&scope=all") {
        return mockJsonResponse([
          {
            name: "builder",
            prompt: "global prompt",
            model: "codex-mini",
            scope: "global",
          },
          {
            name: "builder",
            prompt: "project prompt",
            model: "codex-mini",
            scope: "project",
            projectPath: "/repo/app",
          },
        ]);
      }
      if (url === "/api/projects") {
        return mockJsonResponse([{ path: "/fallback/project" }]);
      }
      return mockJsonResponse([]);
    });
    global.fetch = fetchMock as typeof fetch;

    const createSession = vi.fn(() => "session-1");
    renderHook(() => useAgentLaunch(createSession));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/agents?provider=codex&scope=all");
    expect(createSession).toHaveBeenCalledWith({
      cwd: "/repo/app",
      label: "builder",
      prompt: "project prompt",
      model: "codex-mini",
      effort: undefined,
      agentName: "builder",
      source: "auto",
    });
  });

  it("falls back to checking all providers when URL has no provider param", async () => {
    window.history.pushState({}, "", "/?agent=triage");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agents?provider=claude&scope=all") {
        return mockJsonResponse([]);
      }
      if (url === "/api/agents?provider=codex&scope=all") {
        return mockJsonResponse([
          {
            name: "triage",
            prompt: "codex triage prompt",
            model: "codex-medium",
            scope: "global",
          },
        ]);
      }
      if (url === "/api/agents?provider=gemini&scope=all") {
        return mockJsonResponse([]);
      }
      if (url === "/api/projects") {
        return mockJsonResponse([{ path: "/workspace/root" }]);
      }
      return mockJsonResponse([]);
    });
    global.fetch = fetchMock as typeof fetch;

    const createSession = vi.fn(() => "session-2");
    renderHook(() => useAgentLaunch(createSession));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/agents?provider=claude&scope=all");
    expect(fetchMock).toHaveBeenCalledWith("/api/agents?provider=codex&scope=all");
    expect(fetchMock).toHaveBeenCalledWith("/api/agents?provider=gemini&scope=all");
    expect(createSession).toHaveBeenCalledWith({
      cwd: "/workspace/root",
      label: "triage",
      prompt: "codex triage prompt",
      model: "codex-medium",
      effort: undefined,
      agentName: "triage",
      source: "auto",
    });
  });
});
