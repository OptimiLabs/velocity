# PLAN-6: Settings API and Hook

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Objective

Create the Gemini settings read/write module, register it in the settings API route, and create the `useGeminiSettings` React Query hook. This mirrors the Codex settings pattern exactly.

## Dependencies

- Plan 2 (Gemini config module for read/write)

## Files to Create

1. `lib/gemini/settings.ts` — Settings read/write (thin wrapper over config)
2. `hooks/useGeminiSettings.ts` — React Query hook for Gemini settings

## Files to Modify

1. `app/api/settings/route.ts` — Register gemini provider in PROVIDER_SETTINGS map

## Files to Create (Tests)

1. `__tests__/lib/gemini/settings.test.ts`

---

## Task 1: Write test for Gemini settings

### Test file: `__tests__/lib/gemini/settings.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  readGeminiSettingsFrom,
  writeGeminiSettingsTo,
} from "@/lib/gemini/settings";

describe("readGeminiSettingsFrom", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gemini-settings-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads and returns settings from JSON", () => {
    const f = join(dir, "settings.json");
    writeFileSync(
      f,
      JSON.stringify({
        selectedAuthType: "oauth",
        theme: "dark",
        selectedModel: "gemini-2.5-pro",
      }),
    );
    const settings = readGeminiSettingsFrom(f);
    expect(settings.selectedAuthType).toBe("oauth");
    expect(settings.theme).toBe("dark");
    expect(settings.selectedModel).toBe("gemini-2.5-pro");
  });

  it("returns empty settings for missing file", () => {
    const settings = readGeminiSettingsFrom(join(dir, "nope.json"));
    expect(settings).toEqual({});
  });

  it("returns empty settings for malformed JSON", () => {
    const f = join(dir, "settings.json");
    writeFileSync(f, "not valid json");
    const settings = readGeminiSettingsFrom(f);
    expect(settings).toEqual({});
  });
});

describe("writeGeminiSettingsTo", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gemini-settings-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips settings through JSON", () => {
    const f = join(dir, "settings.json");
    writeGeminiSettingsTo(f, {
      selectedAuthType: "api-key",
      selectedModel: "gemini-2.5-flash",
    });
    const settings = readGeminiSettingsFrom(f);
    expect(settings.selectedAuthType).toBe("api-key");
    expect(settings.selectedModel).toBe("gemini-2.5-flash");
  });
});
```

**Run**: `bun test __tests__/lib/gemini/settings.test.ts` — expect FAIL

---

## Task 2: Implement settings module

### Create: `lib/gemini/settings.ts`

```typescript
import { GEMINI_CONFIG } from "./paths";
import {
  readGeminiConfigFrom,
  writeGeminiConfigTo,
  type GeminiConfig,
} from "./config";

export type GeminiSettings = GeminiConfig;

export function readGeminiSettings(): GeminiSettings {
  return readGeminiConfigFrom(GEMINI_CONFIG);
}

export function readGeminiSettingsFrom(filePath: string): GeminiSettings {
  return readGeminiConfigFrom(filePath);
}

export function writeGeminiSettings(data: GeminiSettings): void {
  writeGeminiConfigTo(GEMINI_CONFIG, data);
}

export function writeGeminiSettingsTo(
  filePath: string,
  data: GeminiSettings,
): void {
  writeGeminiConfigTo(filePath, data);
}
```

**Run**: `bun test __tests__/lib/gemini/settings.test.ts` — expect PASS

---

## Task 3: Register gemini in settings API route

### Modify: `app/api/settings/route.ts`

**Step 3a**: Add import for Gemini settings. After the existing Codex import:

Current:

```typescript
import { readCodexSettings, writeCodexSettings } from "@/lib/codex/settings";
```

Add:

```typescript
import { readGeminiSettings, writeGeminiSettings } from "@/lib/gemini/settings";
```

**Step 3b**: Add gemini to the `PROVIDER_SETTINGS` map. After the codex entry:

Current:

```typescript
const PROVIDER_SETTINGS: Record<
  string,
  {
    read: () => Record<string, unknown>;
    write: (data: Record<string, unknown>) => void;
  }
> = {
  codex: {
    read: readCodexSettings,
    write: writeCodexSettings as (data: Record<string, unknown>) => void,
  },
};
```

New:

```typescript
const PROVIDER_SETTINGS: Record<
  string,
  {
    read: () => Record<string, unknown>;
    write: (data: Record<string, unknown>) => void;
  }
> = {
  codex: {
    read: readCodexSettings,
    write: writeCodexSettings as (data: Record<string, unknown>) => void,
  },
  gemini: {
    read: readGeminiSettings,
    write: writeGeminiSettings as (data: Record<string, unknown>) => void,
  },
};
```

---

## Task 4: Create useGeminiSettings hook

### Create: `hooks/useGeminiSettings.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { GeminiSettings } from "@/lib/gemini/settings";

const GEMINI_SETTINGS_KEY = ["settings", "gemini"] as const;

export function useGeminiSettings() {
  return useQuery({
    queryKey: GEMINI_SETTINGS_KEY,
    queryFn: async (): Promise<GeminiSettings> => {
      const res = await fetch("/api/settings?provider=gemini");
      if (!res.ok) throw new Error("Failed to fetch Gemini settings");
      return res.json();
    },
  });
}

export function useUpdateGeminiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partial: Partial<GeminiSettings>) => {
      const res = await fetch("/api/settings?provider=gemini", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) throw new Error("Failed to update Gemini settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GEMINI_SETTINGS_KEY });
    },
  });
}
```

---

## Task 5: Run tests — expect PASS

**Run**: `bun test __tests__/lib/gemini/settings.test.ts`

**Also run existing settings test**:

- `bun test __tests__/lib/codex/settings.test.ts`

---

## Anti-Hallucination Guardrails

1. **`GeminiSettings` is a type alias for `GeminiConfig`** — mirrors the Codex pattern where `CodexSettings = CodexConfig`
2. **The settings module is a thin wrapper** — actual JSON read/write is in `lib/gemini/config.ts`
3. **The API route uses the same registry pattern** as Codex — `PROVIDER_SETTINGS["gemini"]`
4. **The hook query key is `["settings", "gemini"]`** — distinct from `["settings", "codex"]`
5. **Do NOT create a settings UI component in this plan** — that comes later if needed
6. **The hook imports `GeminiSettings` from `lib/gemini/settings`**, NOT from `lib/gemini/config` — maintain the same indirection as Codex

## Acceptance Criteria

- [ ] `readGeminiSettingsFrom` reads JSON and handles missing/malformed files
- [ ] `writeGeminiSettingsTo` writes valid JSON that round-trips
- [ ] `/api/settings?provider=gemini` GET returns Gemini settings
- [ ] `/api/settings?provider=gemini` PUT writes Gemini settings
- [ ] `useGeminiSettings()` hook is created with correct query key
- [ ] `useUpdateGeminiSettings()` hook invalidates on success
- [ ] Existing Codex settings API still works
- [ ] All tests pass
