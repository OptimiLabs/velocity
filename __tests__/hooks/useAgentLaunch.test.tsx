import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
const routerReplaceMock = vi.fn((href: string) => {
  window.history.replaceState({}, "", href);
});

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: routerReplaceMock }),
}));

import { useAgentLaunch } from "@/hooks/useAgentLaunch";
import { composeAgentLaunchPrompt } from "@/lib/agents/launch-prompt";
import { composeWorkflowPrompt } from "@/lib/workflow/prompt";

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
    routerReplaceMock.mockClear();
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
      prompt: composeAgentLaunchPrompt({
        name: "builder",
        prompt: "project prompt",
        provider: "codex",
        model: "codex-mini",
        scope: "project",
        projectPath: "/repo/app",
      }),
      provider: "codex",
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
      prompt: composeAgentLaunchPrompt({
        name: "triage",
        prompt: "codex triage prompt",
        provider: "codex",
        model: "codex-medium",
        scope: "global",
      }),
      provider: "codex",
      model: "codex-medium",
      effort: undefined,
      agentName: "triage",
      source: "auto",
    });
  });

  it("prefers realPath over encoded Claude project storage path for fallback cwd", async () => {
    window.history.pushState({}, "", "/?agent=triage");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agents?provider=claude&scope=all") {
        return mockJsonResponse([
          {
            name: "triage",
            prompt: "triage prompt",
            model: "sonnet",
            scope: "global",
            provider: "claude",
          },
        ]);
      }
      if (url === "/api/agents?provider=codex&scope=all") {
        return mockJsonResponse([]);
      }
      if (url === "/api/agents?provider=gemini&scope=all") {
        return mockJsonResponse([]);
      }
      if (url === "/api/projects") {
        return mockJsonResponse([
          {
            path: "/Users/me/.claude/projects/-Users-me-side-projects-velocity",
            realPath: "/Users/me/side-projects/velocity",
          },
        ]);
      }
      return mockJsonResponse([]);
    });
    global.fetch = fetchMock as typeof fetch;

    const createSession = vi.fn(() => "session-3");
    renderHook(() => useAgentLaunch(createSession));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/Users/me/side-projects/velocity",
      }),
    );
  });

  it("auto-launches workflow from URL and preserves workflow provider", async () => {
    window.history.pushState(
      {},
      "",
      "/?workflow=wf-1&provider=codex",
    );

    const workflow = {
      id: "wf-1",
      provider: "gemini",
      name: "Workflow One",
      description: "",
      generatedPlan: "",
      nodes: [],
      edges: [],
      cwd: "/repo/workflow",
      swarmId: null,
      commandName: null,
      commandDescription: null,
      activationContext: null,
      autoSkillEnabled: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/workflows/wf-1") {
        return mockJsonResponse(workflow);
      }
      if (url === "/api/projects") {
        return mockJsonResponse([{ path: "/fallback/project" }]);
      }
      return mockJsonResponse([]);
    });
    global.fetch = fetchMock as typeof fetch;

    const createSession = vi.fn(() => "session-workflow");
    renderHook(() => useAgentLaunch(createSession));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });

    expect(createSession).toHaveBeenCalledWith({
      cwd: "/repo/workflow",
      label: "Workflow One",
      prompt: composeWorkflowPrompt(workflow),
      provider: "gemini",
      source: "auto",
    });
  });

  it("uses URL provider for workflow launch when workflow has no provider", async () => {
    window.history.pushState(
      {},
      "",
      "/?workflow=wf-2&provider=codex",
    );

    const workflow = {
      id: "wf-2",
      name: "Workflow Two",
      description: "",
      generatedPlan: "",
      nodes: [],
      edges: [],
      cwd: "",
      swarmId: null,
      commandName: null,
      commandDescription: null,
      activationContext: null,
      autoSkillEnabled: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/workflows/wf-2") {
        return mockJsonResponse(workflow);
      }
      if (url === "/api/projects") {
        return mockJsonResponse([{ path: "/fallback/project" }]);
      }
      return mockJsonResponse([]);
    });
    global.fetch = fetchMock as typeof fetch;

    const createSession = vi.fn(() => "session-workflow-2");
    renderHook(() => useAgentLaunch(createSession));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Workflow Two",
        provider: "codex",
      }),
    );
  });

  it("can launch the same agent repeatedly across URL changes", async () => {
    window.history.pushState({}, "", "/?agent=builder&provider=codex");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agents?provider=codex&scope=all") {
        return mockJsonResponse([
          {
            name: "builder",
            prompt: "ship it",
            model: "codex-mini",
            scope: "global",
          },
        ]);
      }
      if (url === "/api/projects") {
        return mockJsonResponse([{ path: "/workspace/root" }]);
      }
      if (url.startsWith("/api/agents/builder")) {
        return mockJsonResponse({
          name: "builder",
          prompt: "ship it",
          provider: "codex",
          model: "codex-mini",
          scope: "global",
        });
      }
      return mockJsonResponse([]);
    });
    global.fetch = fetchMock as typeof fetch;

    const createSession = vi.fn(() => "session-repeat");
    const hook = renderHook(() => useAgentLaunch(createSession));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });

    // Emulate router-driven render after query params are stripped.
    hook.rerender();

    // Re-launch the same URL again.
    window.history.pushState({}, "", "/?agent=builder&provider=codex");
    hook.rerender();

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(2);
    });
  });
});
