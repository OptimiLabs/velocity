import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProcessingStore } from "@/stores/processingStore";

const useQueryMock = vi.fn(() => ({ data: [], isLoading: false }));
const useQueryClientMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useQueryClient: () => useQueryClientMock(),
}));

import { useWorkflows } from "@/hooks/useWorkflows";

describe("useWorkflows processing refresh", () => {
  beforeEach(() => {
    useQueryMock.mockClear();
    useQueryClientMock.mockReset();
    useProcessingStore.setState({ jobs: [] });
  });

  it("polls while running and for a short grace window after completion", () => {
    useQueryClientMock.mockReturnValue({ invalidateQueries: vi.fn() });
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(10_000);

    renderHook(() => useWorkflows());

    const initialOptions = useQueryMock.mock.calls.at(-1)?.[0] as {
      refetchInterval?: number | false;
    };
    expect(initialOptions?.refetchInterval).toBe(false);

    act(() => {
      useProcessingStore.setState({
        jobs: [
          {
            id: "job-workflow",
            title: "Generate workflow",
            source: "workflows",
            status: "running",
            startedAt: Date.now(),
          },
        ],
      });
    });

    const runningOptions = useQueryMock.mock.calls.at(-1)?.[0] as {
      refetchInterval?: number | false;
    };
    expect(runningOptions?.refetchInterval).toBe(2_000);

    act(() => {
      useProcessingStore.setState({
        jobs: [
          {
            id: "job-workflow",
            title: "Generate workflow",
            source: "workflows",
            status: "completed",
            startedAt: 9_000,
            finishedAt: 10_000,
          },
        ],
      });
    });

    const completedOptions = useQueryMock.mock.calls.at(-1)?.[0] as {
      refetchInterval?: number | false;
    };
    expect(completedOptions?.refetchInterval).toBe(2_000);

    nowSpy.mockReturnValue(25_000);
    act(() => {
      useProcessingStore.setState((state) => ({ jobs: [...state.jobs] }));
    });
    const staleCompletedOptions = useQueryMock.mock.calls.at(-1)?.[0] as {
      refetchInterval?: number | false;
    };
    expect(staleCompletedOptions?.refetchInterval).toBe(false);

    nowSpy.mockRestore();
  });
});
