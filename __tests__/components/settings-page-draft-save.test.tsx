import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettingsPage from "@/app/settings/page";

const {
  mutateAsyncSpy,
  appMutateAsyncSpy,
  geminiMutateAsyncSpy,
  compressAllMutateAsyncSpy,
  confirmSpy,
  toastSuccessSpy,
  toastErrorSpy,
  toastWarningSpy,
  baseSettings,
} = vi.hoisted(() => ({
    mutateAsyncSpy: vi.fn().mockResolvedValue(undefined),
    appMutateAsyncSpy: vi.fn().mockResolvedValue(undefined),
    geminiMutateAsyncSpy: vi.fn().mockResolvedValue(undefined),
    compressAllMutateAsyncSpy: vi.fn().mockResolvedValue({ success: true, updated: 0 }),
    confirmSpy: vi.fn().mockResolvedValue(true),
    toastSuccessSpy: vi.fn(),
    toastErrorSpy: vi.fn(),
    toastWarningSpy: vi.fn(),
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
    warning: toastWarningSpy,
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

vi.mock("@/hooks/useGeminiSettings", () => ({
  useGeminiSettings: vi.fn(() => ({
    data: {},
    isLoading: false,
  })),
  useUpdateGeminiSettings: vi.fn(() => ({
    mutateAsync: geminiMutateAsyncSpy,
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

vi.mock("@/components/settings/GeminiConfigCard", () => ({
  GeminiConfigCard: () => <div>Gemini Card</div>,
}));

vi.mock("@/components/ui/provider-filter", () => ({
  ProviderFilter: () => <div>Provider Filter</div>,
}));

vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({
    confirm: confirmSpy,
  }),
}));

vi.mock("@/hooks/useSessions", () => ({
  useCompressAllSessionsBulk: () => ({
    mutateAsync: compressAllMutateAsyncSpy,
    isPending: false,
  }),
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
    geminiMutateAsyncSpy.mockClear();
    geminiMutateAsyncSpy.mockResolvedValue(undefined);
    compressAllMutateAsyncSpy.mockClear();
    compressAllMutateAsyncSpy.mockResolvedValue({ success: true, updated: 0 });
    confirmSpy.mockClear();
    confirmSpy.mockResolvedValue(true);
    toastSuccessSpy.mockClear();
    toastErrorSpy.mockClear();
    toastWarningSpy.mockClear();
  });

  it("auto-saves Claude changes without explicit save action", async () => {
    render(<SettingsPage />);

    expect(
      screen.queryByRole("button", { name: /save changes/i }),
    ).not.toBeInTheDocument();

    await openClaudeTab();
    fireEvent.click(screen.getByRole("button", { name: /change model/i }));
    expect(mutateAsyncSpy).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mutateAsyncSpy).toHaveBeenCalledWith({
        model: "opus",
      });
    });

    fireEvent.click(
      await screen.findByRole("button", { name: /change defaults/i }),
    );

    await waitFor(() => {
      expect(mutateAsyncSpy).toHaveBeenCalledWith({
        effortLevel: "high",
      });
    });
  });

  it("dispatches MCP restart when auto-saving restart-relevant keys", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<SettingsPage />);

    await openClaudeTab();
    fireEvent.click(await screen.findByRole("button", { name: /change hooks/i }));

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

  it("warns and confirms before compressing all sessions", async () => {
    render(<SettingsPage />);

    fireEvent.click(
      screen.getByRole("button", { name: /compress all sessions/i }),
    );

    await waitFor(() => {
      expect(toastWarningSpy).toHaveBeenCalled();
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Compress all sessions?",
        }),
      );
      expect(compressAllMutateAsyncSpy).toHaveBeenCalledTimes(1);
    });
  });
});
