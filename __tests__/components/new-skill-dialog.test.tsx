import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewSkillDialog } from "@/components/library/NewSkillDialog";

const mutateAsyncMock = vi.fn();

vi.mock("@/hooks/useInstructions", () => ({
  useGenerateSkill: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@/components/providers/ProviderTargetModeSelector", () => ({
  ProviderTargetModeSelector: () => (
    <div data-testid="provider-target-mode-selector" />
  ),
}));

vi.mock("@/components/providers/ArtifactConvertDialog", () => ({
  ArtifactConvertDialog: () => null,
}));

vi.mock("@/components/console/DirectoryPicker", () => ({
  DirectoryPicker: () => <div data-testid="directory-picker" />,
}));

describe("NewSkillDialog", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/projects")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      if (url === "/api/skills" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, name: "my-skill" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    }) as unknown as typeof fetch;
  });

  it("creates a skill directly from the dialog without editor handoff", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(<NewSkillDialog open onClose={onClose} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText("my-skill"), {
      target: { value: "my-skill" },
    });
    fireEvent.change(screen.getByPlaceholderText("# Skill Name"), {
      target: { value: "## Steps\n- Do the thing" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create Skill" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls;
    const createCall = calls.find(
      (entry) =>
        entry[0] === "/api/skills" && entry[1] && entry[1].method === "POST",
    );
    expect(createCall).toBeTruthy();
    expect(JSON.parse(createCall[1].body as string)).toMatchObject({
      name: "my-skill",
      content: "## Steps\n- Do the thing",
    });

    expect(screen.queryByRole("button", { name: "Use This" })).toBeNull();
  });
});
