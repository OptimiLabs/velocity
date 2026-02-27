import { beforeEach, describe, expect, it, vi } from "vitest";

let claudeSettingsState: Record<string, unknown> = {};
let appSettingsState: Record<string, unknown> = {};
const projectSettingsState: Record<string, Record<string, unknown>> = {};

vi.mock("@/lib/codex/settings", () => ({
  readCodexSettings: vi.fn(() => ({})),
  writeCodexSettings: vi.fn(),
}));

vi.mock("@/lib/gemini/settings", () => ({
  readGeminiSettings: vi.fn(() => ({})),
  writeGeminiSettings: vi.fn(),
}));

vi.mock("@/lib/claude-settings", () => ({
  readSettings: vi.fn(() => claudeSettingsState),
  writeSettings: vi.fn((next: Record<string, unknown>) => {
    claudeSettingsState = next;
  }),
  readProjectSettings: vi.fn((cwd: string) => projectSettingsState[cwd] ?? {}),
  writeProjectSettings: vi.fn((cwd: string, next: Record<string, unknown>) => {
    projectSettingsState[cwd] = next;
  }),
}));

vi.mock("@/lib/app-settings", () => ({
  readAppSettings: vi.fn(() => appSettingsState),
  writeAppSettings: vi.fn((next: Record<string, unknown>) => {
    appSettingsState = next;
  }),
}));

import { GET, PUT } from "@/app/api/settings/route";

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

beforeEach(() => {
  claudeSettingsState = {};
  appSettingsState = {};
  for (const key of Object.keys(projectSettingsState)) {
    delete projectSettingsState[key];
  }
});

describe("Settings route compatibility bridge", () => {
  it("merges app settings into default GET response", async () => {
    claudeSettingsState = {
      model: "sonnet",
      orphanTimeoutMs: 1_000,
      statuslinePlan: "pro",
    };
    appSettingsState = {
      orphanTimeoutMs: 9_000,
      sessionAutoLoadAll: true,
    };

    const res = await GET(makeRequest("http://localhost/api/settings"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      model: "sonnet",
      statuslinePlan: "pro",
      sessionAutoLoadAll: true,
      orphanTimeoutMs: 9_000,
    });
  });

  it("writes app-compatible keys to app settings on default PUT", async () => {
    appSettingsState = {
      orphanTimeoutMs: 3_000,
      generationDefaults: {
        "claude-cli": { model: "sonnet" },
      },
    };

    const res = await PUT(
      makeRequest("http://localhost/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "opus",
          orphanTimeoutMs: 9_000,
          generationDefaults: {
            "codex-cli": { model: "o3" },
          },
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(claudeSettingsState).toMatchObject({
      model: "opus",
      orphanTimeoutMs: 9_000,
    });
    expect(appSettingsState).toMatchObject({
      orphanTimeoutMs: 9_000,
      generationDefaults: {
        "claude-cli": { model: "sonnet" },
        "codex-cli": { model: "o3" },
      },
    });
  });

  it("does not write app settings for project-scoped PUT", async () => {
    appSettingsState = { orphanTimeoutMs: 4_000 };

    const res = await PUT(
      makeRequest("http://localhost/api/settings?scope=project&cwd=/tmp/p", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orphanTimeoutMs: 8_000,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(appSettingsState.orphanTimeoutMs).toBe(4_000);
    expect(projectSettingsState["/tmp/p"]).toMatchObject({
      orphanTimeoutMs: 8_000,
    });
  });
});
