import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useConsoleLauncher } from "@/hooks/useConsoleLauncher";
import { composeAgentLaunchPrompt } from "@/lib/agents/launch-prompt";
import { composeWorkflowPrompt } from "@/lib/workflow/prompt";

const { toastSuccessSpy, toastErrorSpy } = vi.hoisted(() => ({
  toastSuccessSpy: vi.fn(),
  toastErrorSpy: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessSpy,
    error: toastErrorSpy,
  },
}));

function mockJsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: async () => data,
  } as Response;
}

describe("useConsoleLauncher", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    toastSuccessSpy.mockClear();
    toastErrorSpy.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("launches agent from picker with provider-aware session payload", async () => {
    const createSession = vi.fn(() => "session-agent");
    const { result } = renderHook(() =>
      useConsoleLauncher(createSession, { current: null }),
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/projects") {
        return mockJsonResponse([{ path: "/repo/default" }]);
      }
      if (url === "/api/agents/builder?provider=codex&projectPath=%2Frepo%2Fapp") {
        return mockJsonResponse({
          name: "builder",
          prompt: "build prompt",
          provider: "codex",
          model: "o3",
          effort: "high",
          scope: "project",
          projectPath: "/repo/app",
          tools: ["Read", "Edit"],
        });
      }
      return mockJsonResponse([]);
    });
    global.fetch = fetchMock as typeof fetch;

    result.current.launchAgent({
      name: "builder",
      prompt: "fallback prompt",
      provider: "codex",
      scope: "project",
      projectPath: "/repo/app",
    });

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });

    expect(createSession).toHaveBeenCalledWith({
      cwd: "/repo/app",
      label: "builder",
      prompt: composeAgentLaunchPrompt({
        name: "builder",
        prompt: "build prompt",
        provider: "codex",
        model: "o3",
        effort: "high",
        scope: "project",
        projectPath: "/repo/app",
        tools: ["Read", "Edit"],
      }),
      provider: "codex",
      model: "o3",
      effort: "high",
      agentName: "builder",
    });
  });

  it("launches workflow from picker and forwards workflow provider", async () => {
    const createSession = vi.fn(() => "session-workflow");
    const { result } = renderHook(() =>
      useConsoleLauncher(createSession, { current: null }),
    );

    const workflow = {
      id: "wf-1",
      provider: "gemini",
      name: "Deploy workflow",
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
        return mockJsonResponse([{ path: "/repo/default" }]);
      }
      return mockJsonResponse([]);
    });
    global.fetch = fetchMock as typeof fetch;

    result.current.launchWorkflow("wf-1");

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
    });

    expect(createSession).toHaveBeenCalledWith({
      cwd: "/repo/workflow",
      label: "Deploy workflow",
      prompt: composeWorkflowPrompt(workflow),
      provider: "gemini",
    });
  });
});
