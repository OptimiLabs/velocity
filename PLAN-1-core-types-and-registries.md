# PLAN-1: Core Types and Registries

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Objective

Add "gemini" as a recognized provider across the type system, session registry, model pricing table, and model tier classification. This is the foundation that all other plans depend on.

## Dependencies

None — this plan is the foundation.

## Files to Modify

1. `types/provider.ts` — Add `"gemini"` to `ConfigProvider` union
2. `lib/providers/session-registry.ts` — Register gemini session provider definition
3. `lib/cost/pricing.ts` — Add all Gemini model pricing entries
4. `lib/cost/calculator.ts` — Add `"gemini"` model tier + update tier labels/colors

## Files to Create (Tests)

1. `__tests__/lib/cost/gemini-pricing.test.ts` — Test pricing entries exist and cost calculation works
2. `__tests__/lib/parser/detect-provider-gemini.test.ts` — Test Gemini model detection

---

## Task 1: Write test for ConfigProvider type and session registry

### Test file: `__tests__/lib/parser/detect-provider-gemini.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { detectSessionProvider } from "@/lib/providers/session-registry";
import {
  getSessionProvider,
  getAllSessionProviders,
} from "@/lib/providers/session-registry";

describe("detectSessionProvider for Gemini models", () => {
  it("returns 'gemini' when model_usage has gemini-2.5-pro", () => {
    expect(
      detectSessionProvider({ "gemini-2.5-pro": { input: 100, output: 50 } }),
    ).toBe("gemini");
  });

  it("returns 'gemini' when model_usage has gemini-2.5-flash", () => {
    expect(
      detectSessionProvider({ "gemini-2.5-flash": { input: 100, output: 50 } }),
    ).toBe("gemini");
  });

  it("returns 'gemini' when model_usage has gemini-3-pro-preview", () => {
    expect(
      detectSessionProvider({
        "gemini-3-pro-preview": { input: 100, output: 50 },
      }),
    ).toBe("gemini");
  });

  it("returns 'gemini' when model_usage has gemini-2.0-flash", () => {
    expect(
      detectSessionProvider({ "gemini-2.0-flash": { input: 100, output: 50 } }),
    ).toBe("gemini");
  });

  it("returns 'gemini' when model_usage has gemini-2.0-flash-lite", () => {
    expect(
      detectSessionProvider({
        "gemini-2.0-flash-lite": { input: 100, output: 50 },
      }),
    ).toBe("gemini");
  });

  it("returns 'claude' for empty model_usage", () => {
    expect(detectSessionProvider({})).toBe("claude");
  });

  it("returns 'gemini' when mixed models include gemini", () => {
    expect(
      detectSessionProvider({
        "claude-sonnet-4-5-20250929": { input: 100, output: 50 },
        "gemini-2.5-pro": { input: 200, output: 100 },
      }),
    ).toBe("gemini");
  });

  it("still returns 'codex' for OpenAI models", () => {
    expect(
      detectSessionProvider({ "gpt-4o": { input: 100, output: 50 } }),
    ).toBe("codex");
  });
});

describe("getSessionProvider for gemini", () => {
  it("returns gemini provider definition", () => {
    const def = getSessionProvider("gemini");
    expect(def).toBeDefined();
    expect(def!.id).toBe("gemini");
    expect(def!.label).toBe("Gemini");
    expect(def!.chartColor).toBeTruthy();
    expect(def!.badgeClasses.bg).toBeTruthy();
    expect(def!.modelPrefixes).toContain("gemini-");
  });

  it("appears in getAllSessionProviders", () => {
    const all = getAllSessionProviders();
    const ids = all.map((p) => p.id);
    expect(ids).toContain("gemini");
  });
});
```

**Run**: `bun test __tests__/lib/parser/detect-provider-gemini.test.ts` — expect FAIL (gemini not registered yet)

---

## Task 2: Write test for Gemini pricing entries

### Test file: `__tests__/lib/cost/gemini-pricing.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { MODEL_PRICING } from "@/lib/cost/pricing";
import { calculateCost, getModelTier } from "@/lib/cost/calculator";
import type { ModelTier } from "@/lib/cost/calculator";

const GEMINI_MODELS = [
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

describe("Gemini model pricing", () => {
  for (const model of GEMINI_MODELS) {
    it(`has pricing entry for ${model}`, () => {
      expect(MODEL_PRICING[model]).toBeDefined();
      expect(MODEL_PRICING[model].input).toBeGreaterThan(0);
      expect(MODEL_PRICING[model].output).toBeGreaterThan(0);
      expect(MODEL_PRICING[model].contextWindow).toBeGreaterThan(0);
    });
  }

  it("calculates non-zero cost for gemini-2.5-pro", () => {
    const cost = calculateCost("gemini-2.5-pro", 10000, 5000);
    expect(cost).toBeGreaterThan(0);
  });

  it("calculates non-zero cost for gemini-2.5-flash", () => {
    const cost = calculateCost("gemini-2.5-flash", 10000, 5000);
    expect(cost).toBeGreaterThan(0);
  });

  it("gemini-2.5-pro should cost more than gemini-2.5-flash for same tokens", () => {
    const proCost = calculateCost("gemini-2.5-pro", 100000, 50000);
    const flashCost = calculateCost("gemini-2.5-flash", 100000, 50000);
    expect(proCost).toBeGreaterThan(flashCost);
  });
});

describe("getModelTier for Gemini models", () => {
  for (const model of GEMINI_MODELS) {
    it(`classifies ${model} as 'gemini' tier`, () => {
      expect(getModelTier(model)).toBe("gemini" as ModelTier);
    });
  }

  it("does not classify claude models as gemini", () => {
    expect(getModelTier("claude-sonnet-4-5-20250929")).not.toBe("gemini");
  });

  it("does not classify gpt models as gemini", () => {
    expect(getModelTier("gpt-4o")).not.toBe("gemini");
  });
});
```

**Run**: `bun test __tests__/lib/cost/gemini-pricing.test.ts` — expect FAIL (no pricing entries, no gemini tier)

---

## Task 3: Add "gemini" to ConfigProvider type

### Modify: `types/provider.ts`

**Current content:**

```typescript
export type ConfigProvider = "claude" | "codex";
// Labels, colors, badge classes, and detection logic now live in
// lib/providers/session-registry.ts — use getSessionProvider(id) instead.
```

**New content:**

```typescript
export type ConfigProvider = "claude" | "codex" | "gemini";
// Labels, colors, badge classes, and detection logic now live in
// lib/providers/session-registry.ts — use getSessionProvider(id) instead.
```

---

## Task 4: Register gemini in session registry

### Modify: `lib/providers/session-registry.ts`

Add the following `register()` call after the existing `codex` registration (after line 39):

```typescript
register({
  id: "gemini",
  label: "Gemini",
  chartColor: "hsl(217, 91%, 60%)",
  badgeClasses: {
    bg: "bg-blue-500/10",
    text: "text-blue-600",
    border: "border-blue-500/30",
  },
  modelPrefixes: ["gemini-"],
});
```

**Note**: Blue color chosen to differentiate from Claude (orange) and Codex (emerald/green). Google's brand blue is appropriate.

---

## Task 5: Add Gemini model pricing entries

### Modify: `lib/cost/pricing.ts`

Add the following entries after the `"codex-mini-latest"` entry (before the closing `};` of `MODEL_PRICING`):

```typescript
  // Google Gemini models (prices in $ per million tokens)
  // Gemini uses "context caching" (not prompt caching) — cacheRead is the
  // cached token rate, cacheWrite is the storage cost approximation.
  // For cost tracking purposes we set cacheWrite/cacheWrite1h to 0 since
  // Gemini CLI sessions don't report cache write tokens separately.
  "gemini-3-pro-preview": {
    input: 1.25,
    output: 10.0,
    cacheRead: 0.3125,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-3-flash-preview": {
    input: 0.15,
    output: 0.6,
    cacheRead: 0.0375,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-2.5-pro": {
    input: 1.25,
    output: 10.0,
    cacheRead: 0.3125,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-2.5-flash": {
    input: 0.15,
    output: 0.6,
    cacheRead: 0.0375,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-2.5-flash-lite": {
    input: 0.075,
    output: 0.3,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-2.0-flash": {
    input: 0.1,
    output: 0.4,
    cacheRead: 0.025,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-2.0-flash-lite": {
    input: 0.075,
    output: 0.3,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
```

---

## Task 6: Add "gemini" model tier

### Modify: `lib/cost/calculator.ts`

**Step 6a**: Update the `ModelTier` type (line 102):

Current:

```typescript
export type ModelTier =
  | "opus"
  | "sonnet"
  | "haiku"
  | "gpt"
  | "reasoning"
  | "codex"
  | "other";
```

New:

```typescript
export type ModelTier =
  | "opus"
  | "sonnet"
  | "haiku"
  | "gpt"
  | "reasoning"
  | "codex"
  | "gemini"
  | "other";
```

**Step 6b**: Add gemini check in `getModelTier()` function (add before the `return "other"` line):

Current (lines 107-115):

```typescript
export function getModelTier(model: string): ModelTier {
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  if (model.startsWith("codex-")) return "codex";
  if (/^o\d+(-|$)/.test(model)) return "reasoning";
  if (model.startsWith("gpt-")) return "gpt";
  return "other";
}
```

New:

```typescript
export function getModelTier(model: string): ModelTier {
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  if (model.startsWith("gemini-")) return "gemini";
  if (model.startsWith("codex-")) return "codex";
  if (/^o\d+(-|$)/.test(model)) return "reasoning";
  if (model.startsWith("gpt-")) return "gpt";
  return "other";
}
```

**Step 6c**: Add gemini to `TIER_LABELS` (line 117-125):

Add after `codex: "Codex",`:

```typescript
  gemini: "Gemini",
```

**Step 6d**: Add gemini to `TIER_COLORS` (line 127-135):

Add after `codex: "bg-chart-6",`:

```typescript
  gemini: "bg-chart-7",
```

**Note**: If `bg-chart-7` doesn't exist in the theme, use `"bg-blue-500"` as a fallback. Check `tailwind.config.ts` for available chart colors.

---

## Task 7: Run tests — expect PASS

**Run**: `bun test __tests__/lib/parser/detect-provider-gemini.test.ts __tests__/lib/cost/gemini-pricing.test.ts`

Both test files should now pass.

**Also run existing tests** to confirm no regressions:

- `bun test __tests__/lib/parser/detect-provider.test.ts`
- `bun test __tests__/lib/cost/calculator.test.ts`

---

## Anti-Hallucination Guardrails

1. **Do NOT create `lib/gemini/` directory in this plan** — that is Plan 2
2. **Do NOT modify `lib/parser/session-aggregator.ts`** — it already delegates to `detectSessionProvider`
3. **Do NOT add `"gemini"` to the `EditorType` union** — that goes in Plan 5 (if needed)
4. **The `chartColor` for gemini uses HSL format** matching the existing pattern (Claude = orange hsl, Codex = green hsl)
5. **Pricing values must come from Google's published API pricing** — do NOT invent prices
6. **The `modelPrefixes` array must use `"gemini-"` (with trailing hyphen)** to avoid false matches

## Acceptance Criteria

- [ ] `ConfigProvider` type includes `"gemini"` — TypeScript compilation passes
- [ ] `getSessionProvider("gemini")` returns a valid definition
- [ ] `detectSessionProvider({ "gemini-2.5-pro": {} })` returns `"gemini"`
- [ ] `MODEL_PRICING["gemini-2.5-pro"]` is defined with correct pricing
- [ ] `getModelTier("gemini-2.5-pro")` returns `"gemini"`
- [ ] All 7 Gemini models have pricing entries
- [ ] Existing Claude/Codex tests still pass
- [ ] `TIER_LABELS.gemini` === `"Gemini"`
- [ ] `TIER_COLORS.gemini` is defined
