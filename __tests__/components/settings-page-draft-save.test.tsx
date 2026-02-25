import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettingsPage from "@/app/settings/page";

const {
  mutateAsyncSpy,
  appMutateAsyncSpy,
  toastSuccessSpy,
  toastErrorSpy,
  baseSettings,
} = vi.hoisted(() => ({
    mutateAsyncSpy: vi.fn().mockResolvedValue(undefined),
    appMutateAsyncSpy: vi.fn().mockResolvedValue(undefined),
    toastSuccessSpy: vi.fn(),
    toastErrorSpy: vi.fn(),
    baseSettings: {
      model: "sonnet",
      effortLevel: "medium",
      hooks: {},
      mcpServers: {},
      disabledMcpServers: {},
      env: {},
    },
  }),
);

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessSpy,
    error: toastErrorSpy,
  },
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: vi.fn(() => ({
    data: baseSettings,
    isLoading: false,
  })),
  useUpdateSettings: vi.fn(() => ({
    mutateAsync: mutateAsyncSpy,
    isPending: false,
  })),
}));

vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: vi.fn(() => ({
    data: {
      autoArchiveDays: 0,
      sessionAutoLoadAll: false,
      disableHeaderView: false,
    },
    isLoading: false,
  })),
  useUpdateAppSettings: vi.fn(() => ({
    mutateAsync: appMutateAsyncSpy,
    isPending: false,
  })),
}));

vi.mock("@/components/settings/ModelProvidersCard", () => ({
  ModelProvidersCard: ({
    onUpdate,
  }: {
    onUpdate: (patch: Record<string, unknown>) => Promise<void>;
  }) => (
    <button type="button" onClick={() => void onUpdate({ model: "opus" })}>
      Change Model
    </button>
  ),
}));

vi.mock("@/components/settings/BehaviorCard", () => ({
  ClaudeDefaultsCard: ({
    onUpdate,
  }: {
    onUpdate: (patch: Record<string, unknown>) => Promise<void>;
  }) => (
    <button
      type="button"
      onClick={() => void onUpdate({ effortLevel: "high" })}
    >
      Change Defaults
    </button>
  ),
  AppPreferencesCard: ({
    onUpdate,
  }: {
    onUpdate: (patch: Record<string, unknown>) => Promise<void>;
  }) => (
    <button
      type="button"
      onClick={() => void onUpdate({ hooks: { PreToolUse: [] } })}
    >
      Change Hooks
    </button>
  ),
}));

vi.mock("@/components/settings/ExperimentalCard", () => ({
  ExperimentalCard: () => <div>Experimental Card</div>,
}));

vi.mock("@/components/settings/EnvVarsCard", () => ({
  EnvVarsCard: () => <div>Env Vars Card</div>,
}));

vi.mock("@/components/settings/CodexConfigCard", () => ({
  CodexConfigCard: () => <div>Codex Card</div>,
}));

vi.mock("@/components/ui/provider-filter", () => ({
  ProviderFilter: () => <div>Provider Filter</div>,
}));

describe("SettingsPage draft save flow", () => {
  const openClaudeTab = async () => {
    const claudeTab = screen.getByRole("tab", { name: /claude/i });
    fireEvent.mouseDown(claudeTab);
    fireEvent.click(claudeTab);
    fireEvent.keyDown(claudeTab, { key: "Enter" });
    await waitFor(() => {
      expect(claudeTab).toHaveAttribute("aria-selected", "true");
    });
  };

  beforeEach(() => {
    mutateAsyncSpy.mockClear();
    mutateAsyncSpy.mockResolvedValue(undefined);
    appMutateAsyncSpy.mockClear();
    appMutateAsyncSpy.mockResolvedValue(undefined);
    toastSuccessSpy.mockClear();
    toastErrorSpy.mockClear();
  });

  it("does not autosave child changes and saves them on explicit action", async () => {
    render(<SettingsPage />);

    const saveButton = await screen.findByRole("button", {
      name: /save changes/i,
    });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /change model/i }));
    await openClaudeTab();
    fireEvent.click(await screen.findByRole("button", { name: /change defaults/i }));

    expect(mutateAsyncSpy).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mutateAsyncSpy).toHaveBeenCalledTimes(1);
    });
    expect(mutateAsyncSpy).toHaveBeenCalledWith({
      model: "opus",
      effortLevel: "high",
    });
    expect(toastSuccessSpy).toHaveBeenCalledWith("Claude settings saved");
  });

  it("dispatches MCP restart when saving restart-relevant keys", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<SettingsPage />);

    await openClaudeTab();
    fireEvent.click(await screen.findByRole("button", { name: /change hooks/i }));
    fireEvent.click(await screen.findByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mutateAsyncSpy).toHaveBeenCalledWith({
        hooks: { PreToolUse: [] },
      });
    });

    expect(dispatchSpy).toHaveBeenCalled();
    const restartEventCall = dispatchSpy.mock.calls.find(
      ([event]) => event instanceof CustomEvent && event.type === "mcp:restart-sessions",
    );
    expect(restartEventCall).toBeTruthy();
    dispatchSpy.mockRestore();
  });
});
