import { beforeEach, describe, expect, it, vi } from "vitest";

let codexSettingsState: Record<string, unknown> = {};

vi.mock("@/lib/codex/settings", () => ({
  readCodexSettings: vi.fn(() => codexSettingsState),
  writeCodexSettings: vi.fn((next: Record<string, unknown>) => {
    codexSettingsState = next;
  }),
}));

vi.mock("@/lib/gemini/settings", () => ({
  readGeminiSettings: vi.fn(() => ({})),
  writeGeminiSettings: vi.fn(),
}));

vi.mock("@/lib/claude-settings", () => ({
  readSettings: vi.fn(() => ({})),
  writeSettings: vi.fn(),
  readProjectSettings: vi.fn(() => ({})),
  writeProjectSettings: vi.fn(),
}));

import { GET, PUT } from "@/app/api/settings/route";

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

beforeEach(() => {
  codexSettingsState = {};
});

describe("Codex provider settings route", () => {
  it("returns codex settings metadata when includeMeta=1", async () => {
    codexSettingsState = {
      model: "o3",
      sandbox: { enable: true },
      providers: {
        openai: {
          base_url: "https://example.com",
        },
      },
    };

    const req = makeRequest(
      "http://localhost/api/settings?provider=codex&includeMeta=1",
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe("codex");
    expect(data.settings.model).toBe("o3");
    expect(data.metadata.unsupportedKeys).toContain("providers.openai.base_url");
  });

  it("deep merges codex nested objects and preserves unsupported keys", async () => {
    codexSettingsState = {
      sandbox: {
        enable: false,
        extraMode: "strict",
      },
      providers: {
        openai: {
          base_url: "https://example.com",
        },
      },
    };

    const req = makeRequest("http://localhost/api/settings?provider=codex", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sandbox: { enable: true } }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(codexSettingsState).toEqual({
      sandbox: {
        enable: true,
        extraMode: "strict",
      },
      providers: {
        openai: {
          base_url: "https://example.com",
        },
      },
    });
  });
});

