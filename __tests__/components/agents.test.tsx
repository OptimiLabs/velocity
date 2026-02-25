import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { AgentBuilderChat } from "@/components/agents/AgentBuilderChat";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
  usePathname: vi.fn().mockReturnValue("/agents"),
  useSearchParams: vi.fn().mockReturnValue(new URLSearchParams()),
}));

// Mock fetch for AgentBuilder (tools API + build API)
global.fetch = vi.fn().mockImplementation(
  () =>
    new Promise(() => {
      // Intentionally pending: these tests only assert static UI and fetch invocation.
    }),
) as unknown as typeof fetch;

describe("Agents Components", () => {
  describe("AgentBuilder", () => {
    it("should render with the build button", () => {
      const mockOnClose = vi.fn();
      const mockOnGenerated = vi.fn();

      render(
        <AgentBuilder
          open={true}
          onClose={mockOnClose}
          onGenerated={mockOnGenerated}
        />,
      );

      expect(screen.getByText("Build Agent with AI")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/e.g. A code reviewer/i),
      ).toBeInTheDocument();
      expect(screen.getByText("Generate Agent")).toBeInTheDocument();
    });

    it("should have a description textarea", () => {
      const mockOnClose = vi.fn();
      const mockOnGenerated = vi.fn();

      render(
        <AgentBuilder
          open={true}
          onClose={mockOnClose}
          onGenerated={mockOnGenerated}
        />,
      );

      const textarea = screen.getByPlaceholderText(/e.g. A code reviewer/i);
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe("TEXTAREA");
    });

    it("should have runtime model and advanced AI assist section", () => {
      const mockOnClose = vi.fn();
      const mockOnGenerated = vi.fn();

      render(
        <AgentBuilder
          open={true}
          onClose={mockOnClose}
          onGenerated={mockOnGenerated}
        />,
      );

      expect(screen.getByText("Agent Runtime Model")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Advanced" })).toBeInTheDocument();
      expect(screen.queryByText("AI Assist LLM")).not.toBeInTheDocument();
    });

    it("shows AI assist provider selector inside advanced", () => {
      render(
        <AgentBuilder
          open={true}
          onClose={vi.fn()}
          onGenerated={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
      expect(screen.getByText("AI Assist LLM")).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Default (from Settings)" }),
      ).toBeInTheDocument();
    });

    it("should disable generate button when description is empty", () => {
      const mockOnClose = vi.fn();
      const mockOnGenerated = vi.fn();

      render(
        <AgentBuilder
          open={true}
          onClose={mockOnClose}
          onGenerated={mockOnGenerated}
        />,
      );

      const generateButton = screen.getByText("Generate Agent");
      expect(generateButton).toBeDisabled();
    });
  });

  describe("AgentBuilderChat", () => {
    it("renders an LLM provider picker", async () => {
      render(
        <AgentBuilderChat
          open={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      const providerSelect = screen.getByLabelText("LLM provider");
      expect(providerSelect).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Claude CLI" })).toBeInTheDocument();

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it("renders save scope controls", () => {
      render(
        <AgentBuilderChat
          open={true}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      expect(screen.getByText("Save scope")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Global" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Project" })).toBeInTheDocument();
    });
  });

});
