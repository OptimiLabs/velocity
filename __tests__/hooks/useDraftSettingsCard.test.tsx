import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDraftSettingsCard } from "@/hooks/useDraftSettingsCard";

interface TestSettings {
  model?: string;
  effortLevel?: "low" | "medium" | "high";
  nested?: {
    enabled?: boolean;
    mode?: string;
  };
  hooks?: Record<string, unknown[]>;
}

describe("useDraftSettingsCard", () => {
  it("tracks dirty state and saves a top-level patch", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const initial: TestSettings = {
      model: "sonnet",
      nested: { enabled: true, mode: "safe" },
    };

    const { result } = renderHook(() =>
      useDraftSettingsCard<TestSettings>({
        source: initial,
        onSave,
      }),
    );

    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.patchDraft({
        nested: { mode: "workspace-write" },
        model: "opus",
      });
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.dirtyKeys).toEqual(["model", "nested"]);
    expect(result.current.draft?.nested).toEqual({
      enabled: true,
      mode: "workspace-write",
    });

    await act(async () => {
      await result.current.save();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      patch: {
        model: "opus",
        nested: { enabled: true, mode: "workspace-write" },
      },
      baseline: {
        model: "sonnet",
        nested: { enabled: true, mode: "safe" },
      },
      draft: {
        model: "opus",
        nested: { enabled: true, mode: "workspace-write" },
      },
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.saveState).toBe("saved");
  });

  it("resets draft to baseline", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDraftSettingsCard<TestSettings>({
        source: { effortLevel: "low" },
        onSave,
      }),
    );

    act(() => {
      result.current.patchDraft({ effortLevel: "high" });
    });
    expect(result.current.draft?.effortLevel).toBe("high");
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.draft?.effortLevel).toBe("low");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasIncomingRefresh).toBe(false);
  });

  it("flags incoming refresh while dirty without clobbering the draft", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const sourceA: TestSettings = { model: "sonnet", hooks: { pre: [] } };
    const sourceB: TestSettings = { model: "opus", hooks: { pre: [] } };

    const { result, rerender } = renderHook(
      ({ source }) =>
        useDraftSettingsCard<TestSettings>({
          source,
          onSave,
        }),
      { initialProps: { source: sourceA } },
    );

    act(() => {
      result.current.patchDraft({ model: "haiku" });
    });
    expect(result.current.isDirty).toBe(true);

    rerender({ source: sourceB });

    await waitFor(() => {
      expect(result.current.hasIncomingRefresh).toBe(true);
    });
    expect(result.current.draft?.model).toBe("haiku");
    expect(result.current.baseline?.model).toBe("sonnet");
  });
});
