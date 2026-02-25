import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToolsTab } from "@/components/library/ToolsTab";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
  usePathname: vi.fn().mockReturnValue("/library"),
  useSearchParams: vi.fn().mockReturnValue(new URLSearchParams()),
}));

// Mock tools API response
const mockTools = [
  {
    name: "Read",
    type: "builtin",
    description: "Read files from the filesystem",
  },
  {
    name: "Write",
    type: "builtin",
    description: "Write files to the filesystem",
  },
  { name: "Bash", type: "builtin", description: "Execute shell commands" },
  {
    name: "Edit",
    type: "builtin",
    description: "Edit files with string replacements",
  },
];

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url === "/api/skills") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockTools),
    });
  }) as unknown as typeof fetch;
});

describe("Library Components", () => {
  describe("ToolsTab", () => {
    it("should render tool categories", async () => {
      render(<ToolsTab />, { wrapper: Wrapper });
      await screen.findByText("Builtin Tools");

      expect(screen.getByText("Available Tools")).toBeInTheDocument();

      // Updated subtitle text
      expect(
        screen.getByText(/Builtin tools, MCP servers, plugins, and skills/i),
      ).toBeInTheDocument();
    });

    it("should render search input", async () => {
      render(<ToolsTab />, { wrapper: Wrapper });
      await screen.findByText("Builtin Tools");

      const searchInput = screen.getByPlaceholderText("Search tools...");
      expect(searchInput).toBeInTheDocument();
    });

    it("should render builtin tools after loading", async () => {
      render(<ToolsTab />, { wrapper: Wrapper });

      const builtinSection = await screen.findByText("Builtin Tools");
      expect(builtinSection).toBeInTheDocument();

      expect(await screen.findByText("Read")).toBeInTheDocument();
      expect(await screen.findByText("Write")).toBeInTheDocument();
      expect(await screen.findByText("Bash")).toBeInTheDocument();
    });

    it("should display tool descriptions", async () => {
      render(<ToolsTab />, { wrapper: Wrapper });

      await screen.findByText("Builtin Tools");

      expect(
        screen.getByText("Read files from the filesystem"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Write files to the filesystem"),
      ).toBeInTheDocument();
      expect(screen.getByText("Execute shell commands")).toBeInTheDocument();
    });

    it("should show builtin badge on tools", async () => {
      render(<ToolsTab />, { wrapper: Wrapper });

      await screen.findByText("Builtin Tools");

      const badges = screen.getAllByText("builtin");
      expect(badges.length).toBeGreaterThan(0);
    });
  });
});
