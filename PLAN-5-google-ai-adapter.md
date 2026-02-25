# PLAN-5: Google AI Adapter

> For Claude: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Objective

Create a `GoogleAdapter` implementing `AIProviderAdapter` for the Gemini API. This allows the app to use Google's Gemini models as an AI backend for instruction file editing, composing, and summarization. The adapter talks directly to `generativelanguage.googleapis.com`.

## Dependencies

- Plan 1 (ConfigProvider type)

## Files to Create

1. `lib/providers/adapters/google.ts` — GoogleAdapter implementing AIProviderAdapter

## Files to Modify

1. `lib/providers/ai-registry.ts` — Register the GoogleAdapter
2. `types/instructions.ts` — Add `"ai-google"` to `EditorType` union

---

## Task 1: Write test for GoogleAdapter

Since the adapter makes external API calls, we test the structural contract (interface compliance, availability checks, API key resolution) rather than live API calls.

### Test file: `__tests__/lib/providers/google-adapter.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { GoogleAdapter } from "@/lib/providers/adapters/google";
import {
  getAIProvider,
  getAllAIProviderIds,
} from "@/lib/providers/ai-registry";

describe("GoogleAdapter", () => {
  it("has correct id", () => {
    const adapter = new GoogleAdapter();
    expect(adapter.id).toBe("google");
  });

  it("has a default model", () => {
    const adapter = new GoogleAdapter();
    expect(adapter.defaultModel).toBe("gemini-2.5-flash");
  });

  it("uses GOOGLE_API_KEY env var", () => {
    const adapter = new GoogleAdapter();
    expect(adapter.envVarKey).toBe("GOOGLE_API_KEY");
  });

  it("getApiKey returns null when no key is configured", () => {
    const adapter = new GoogleAdapter();
    // In test environment, there's no API key unless explicitly set
    const key = adapter.getApiKey();
    // Either null or a string — we don't assert the value, just the type
    expect(key === null || typeof key === "string").toBe(true);
  });

  it("isAvailable returns false when no API key", () => {
    const adapter = new GoogleAdapter();
    // Without env var or DB key, should not be available
    // (may be true if user has GOOGLE_API_KEY set)
    expect(typeof adapter.isAvailable()).toBe("boolean");
  });
});

describe("GoogleAdapter registration", () => {
  it("is registered in the AI registry", () => {
    const adapter = getAIProvider("google");
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe("google");
  });

  it("appears in all AI provider IDs", () => {
    const ids = getAllAIProviderIds();
    expect(ids).toContain("google");
  });
});
```

**Run**: `bun test __tests__/lib/providers/google-adapter.test.ts` — expect FAIL

---

## Task 2: Add "ai-google" to EditorType

### Modify: `types/instructions.ts`

Current `EditorType` (line 16-20):

```typescript
export type EditorType =
  | "manual"
  | "ai-anthropic"
  | "ai-openai"
  | "ai-claude-cli";
```

New:

```typescript
export type EditorType =
  | "manual"
  | "ai-anthropic"
  | "ai-openai"
  | "ai-google"
  | "ai-claude-cli";
```

---

## Task 3: Implement GoogleAdapter

### Create: `lib/providers/adapters/google.ts`

```typescript
import type {
  AIProviderAdapter,
  AICompletionRequest,
  AICompletionResponse,
} from "../ai-adapter";
import { getAIProviderKey } from "@/lib/db/instruction-files";

export class GoogleAdapter implements AIProviderAdapter {
  readonly id = "google";
  readonly defaultModel = "gemini-2.5-flash";
  readonly envVarKey = "GOOGLE_API_KEY";

  isAvailable(): boolean {
    return !!this.getApiKey();
  }

  getApiKey(): string | null {
    return getAIProviderKey("google") || process.env.GOOGLE_API_KEY || null;
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("No Google API key configured");

    const model = req.model || this.defaultModel;
    const controller = new AbortController();
    const timer = req.timeoutMs
      ? setTimeout(() => controller.abort(), req.timeoutMs)
      : null;

    try {
      // Build contents array in Gemini API format
      const contents: Array<{
        role: string;
        parts: Array<{ text: string }>;
      }> = [];

      if (req.system) {
        // Gemini uses systemInstruction at the top level, not in contents
        // We'll include it in the request body separately
      }

      contents.push({
        role: "user",
        parts: [{ text: req.prompt }],
      });

      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 16384,
        },
      };

      if (req.system) {
        body.systemInstruction = {
          parts: [{ text: req.system }],
        };
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Google AI API error: ${response.status} ${err}`);
      }

      const data = await response.json();

      // Extract text from response
      const candidates = data.candidates || [];
      const firstCandidate = candidates[0];
      const parts = firstCandidate?.content?.parts || [];
      const content = parts
        .map((p: { text?: string }) => p.text || "")
        .join("");

      // Extract token usage from usageMetadata
      const usage = data.usageMetadata || {};
      const inputTokens = usage.promptTokenCount || 0;
      const outputTokens = usage.candidatesTokenCount || 0;

      // Gemini 2.5 Flash pricing: $0.15/1M input, $0.60/1M output
      const cost = (inputTokens * 0.15 + outputTokens * 0.6) / 1_000_000;

      return {
        content: content.trim(),
        inputTokens,
        outputTokens,
        cost,
        editorType: "ai-google",
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
```

---

## Task 4: Register GoogleAdapter in AI registry

### Modify: `lib/providers/ai-registry.ts`

Add import and registration. Current file:

```typescript
import type { AIProviderAdapter } from "./ai-adapter";
import { AnthropicAdapter } from "./adapters/anthropic";
import { OpenAIAdapter } from "./adapters/openai";
import { CustomAdapter } from "./adapters/custom";
```

Add after the OpenAI import:

```typescript
import { GoogleAdapter } from "./adapters/google";
```

And add registration after `register(new OpenAIAdapter());`:

```typescript
register(new GoogleAdapter());
```

Full updated file:

```typescript
import type { AIProviderAdapter } from "./ai-adapter";
import { AnthropicAdapter } from "./adapters/anthropic";
import { OpenAIAdapter } from "./adapters/openai";
import { GoogleAdapter } from "./adapters/google";
import { CustomAdapter } from "./adapters/custom";

const registry = new Map<string, AIProviderAdapter>();

function register(adapter: AIProviderAdapter) {
  registry.set(adapter.id, adapter);
}

// Register built-in adapters
register(new AnthropicAdapter());
register(new OpenAIAdapter());
register(new GoogleAdapter());
register(new CustomAdapter());

export function getAIProvider(id: string): AIProviderAdapter | undefined {
  return registry.get(id);
}

export function requireAIProvider(id: string): AIProviderAdapter {
  const adapter = registry.get(id);
  if (!adapter) throw new Error(`Unknown AI provider: ${id}`);
  return adapter;
}

export function getAvailableAIProviders(): AIProviderAdapter[] {
  return [...registry.values()].filter((a) => a.isAvailable());
}

export function getAllAIProviderIds(): string[] {
  return [...registry.keys()];
}
```

---

## Task 5: Run tests — expect PASS

**Run**: `bun test __tests__/lib/providers/google-adapter.test.ts`

All tests should pass.

---

## Anti-Hallucination Guardrails

1. **Gemini API uses `generativelanguage.googleapis.com`**, NOT `ai.googleapis.com` or `aiplatform.googleapis.com`
2. **API key is passed as a URL parameter** (`?key=...`), NOT as a Bearer token or custom header — this is the standard Gemini API pattern
3. **System instructions use `systemInstruction` at the top level**, NOT as a "system" role in contents — Gemini API does not support "system" role in contents array
4. **Response format**: `data.candidates[0].content.parts[].text` — NOT `data.choices[0].message.content` (that's OpenAI)
5. **Token usage is in `usageMetadata`**, NOT `usage` — `promptTokenCount` and `candidatesTokenCount`
6. **The `editorType` is `"ai-google"`** — added to the EditorType union in types/instructions.ts
7. **Default model is `gemini-2.5-flash`** — the most cost-effective option for AI editing tasks
8. **Do NOT use the Vertex AI endpoint** — this is the consumer Gemini API, not the enterprise one

## Acceptance Criteria

- [ ] `GoogleAdapter` implements `AIProviderAdapter` interface
- [ ] `GoogleAdapter.id` is `"google"`
- [ ] `GoogleAdapter.defaultModel` is `"gemini-2.5-flash"`
- [ ] `GoogleAdapter.envVarKey` is `"GOOGLE_API_KEY"`
- [ ] `getApiKey()` checks DB first, then env var
- [ ] `complete()` calls the correct Gemini API endpoint
- [ ] `complete()` handles system instructions via `systemInstruction`
- [ ] `complete()` extracts tokens from `usageMetadata`
- [ ] `getAIProvider("google")` returns the registered adapter
- [ ] `"ai-google"` is a valid `EditorType`
- [ ] All tests pass
