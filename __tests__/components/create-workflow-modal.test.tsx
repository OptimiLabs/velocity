import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateWorkflowModal } from "@/components/workflows/CreateWorkflowModal";

const {
  routerPushSpy,
  createMutateSpy,
  createMutateAsyncSpy,
  generateMutateAsyncSpy,
  toastLoadingSpy,
  toastSuccessSpy,
  toastErrorSpy,
} = vi.hoisted(() => {
  const routerPush = vi.fn();
  const createMutate = vi.fn(
    (
      _payload: { name: string },
      options?: { onSuccess?: (workflow: { id: string }) => void },
    ) => {
      options?.onSuccess?.({ id: "wf_manual" });
      return undefined;
    },
  );
  const createMutateAsync = vi.fn(async () => ({
    id: "wf_ai",
    name: "AI Workflow",
  }));
  const generateMutateAsync = vi.fn(async () => ({
    plan: "Build it end-to-end",
    name: "AI Workflow",
    nodes: [
      {
        id: "step-1",
        label: "Build landing UI",
        taskDescription: "Implement responsive landing sections and copy",
        agentName: "ui-builder",
        status: "unconfirmed",
        position: { x: 0, y: 0 },
        dependsOn: [],
        skills: ["frontend"],
        effort: "medium",
      },
    ],
    edges: [],
  }));
  return {
    routerPushSpy: routerPush,
    createMutateSpy: createMutate,
    createMutateAsyncSpy: createMutateAsync,
    generateMutateAsyncSpy: generateMutateAsync,
    toastLoadingSpy: vi.fn(() => "toast-loading-id"),
    toastSuccessSpy: vi.fn(),
    toastErrorSpy: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushSpy }),
}));

vi.mock("sonner", () => ({
  toast: {
    loading: toastLoadingSpy,
    success: toastSuccessSpy,
    error: toastErrorSpy,
  },
}));

vi.mock("@/hooks/useAgents", () => ({
  useAgents: () => ({
    data: [{ name: "reviewer", description: "Reviews code", enabled: true }],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useWorkflows", () => ({
  useCreateWorkflow: () => ({
    mutate: createMutateSpy,
    mutateAsync: createMutateAsyncSpy,
    isPending: false,
  }),
  useGenerateWorkflow: () => ({
    mutateAsync: generateMutateAsyncSpy,
    isPending: false,
  }),
}));

vi.mock("@/stores/providerScopeStore", () => ({
  useProviderScopeStore: (
    selector: (state: { providerScope: "claude" }) => unknown,
  ) => selector({ providerScope: "claude" }),
}));

describe("CreateWorkflowModal", () => {
  beforeEach(() => {
    routerPushSpy.mockClear();
    createMutateSpy.mockClear();
    createMutateAsyncSpy.mockClear();
    generateMutateAsyncSpy.mockClear();
    toastLoadingSpy.mockClear();
    toastSuccessSpy.mockClear();
    toastErrorSpy.mockClear();
  });

  it("runs AI generation in background and only navigates when toast action is clicked", async () => {
    const onOpenChange = vi.fn();

    render(
      <CreateWorkflowModal open onOpenChange={onOpenChange} mode="ai" />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        "e.g. Review all PRs, run tests, deploy to staging if they pass...",
      ),
      { target: { value: "Build a landing page workflow" } },
    );

    fireEvent.change(
      screen.getByPlaceholderText("Auto-derived from prompt if blank"),
      { target: { value: "Landing Flow" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate In Background" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);

    await waitFor(() => {
      expect(generateMutateAsyncSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Build a landing page workflow",
          complexity: "auto",
        }),
      );
      expect(createMutateAsyncSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Landing Flow",
          generatedPlan: "Build it end-to-end",
          _suppressSuccessToast: true,
          _suppressErrorToast: true,
        }),
      );
      expect(toastLoadingSpy).toHaveBeenCalled();
      expect(toastSuccessSpy).toHaveBeenCalled();
    });

    expect(routerPushSpy).not.toHaveBeenCalled();

    const successOptions = toastSuccessSpy.mock.calls[0]?.[1] as
      | {
          action?: { label: string; onClick: () => void };
        }
      | undefined;
    expect(successOptions?.action?.label).toBe("Open");
    successOptions?.action?.onClick();
    expect(routerPushSpy).toHaveBeenCalledWith("/workflows/wf_ai");
  });

  it("keeps manual create behavior (create then navigate immediately)", async () => {
    const onOpenChange = vi.fn();

    render(
      <CreateWorkflowModal open onOpenChange={onOpenChange} mode="manual" />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. Code Review Pipeline"), {
      target: { value: "Manual Flow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createMutateSpy).toHaveBeenCalled();
      expect(routerPushSpy).toHaveBeenCalledWith("/workflows/wf_manual");
    });
  });

  it("shows an error toast and skips workflow creation when AI generation fails", async () => {
    generateMutateAsyncSpy.mockRejectedValueOnce(new Error("generation failed"));
    const onOpenChange = vi.fn();

    render(
      <CreateWorkflowModal open onOpenChange={onOpenChange} mode="ai" />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        "e.g. Review all PRs, run tests, deploy to staging if they pass...",
      ),
      { target: { value: "Generate and fail" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate In Background" }));

    await waitFor(() => {
      expect(generateMutateAsyncSpy).toHaveBeenCalled();
      expect(createMutateAsyncSpy).not.toHaveBeenCalled();
      expect(toastErrorSpy).toHaveBeenCalled();
    });
  });
});
