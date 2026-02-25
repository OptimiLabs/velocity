import type {
  AIProviderAdapter,
  AICompletionRequest,
  AICompletionResponse,
} from "../ai-adapter";
import { getAIProviderKey } from "@/lib/db/instruction-files";

export class AnthropicAdapter implements AIProviderAdapter {
  readonly id = "anthropic";
  readonly defaultModel = "claude-sonnet-4-5-20250929";
  readonly envVarKey = "ANTHROPIC_API_KEY";

  isAvailable(): boolean {
    return !!this.getApiKey();
  }

  getApiKey(): string | null {
    return (
      getAIProviderKey("anthropic") || process.env.ANTHROPIC_API_KEY || null
    );
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("No Anthropic API key configured");

    const model = req.model || this.defaultModel;
    const controller = new AbortController();
    const timer = req.timeoutMs
      ? setTimeout(() => controller.abort(), req.timeoutMs)
      : null;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? 16384,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.topP !== undefined ? { top_p: req.topP } : {}),
          ...(req.topK !== undefined ? { top_k: req.topK } : {}),
          ...(req.thinkingBudget !== undefined
            ? { thinking: { type: "enabled", budget_tokens: req.thinkingBudget } }
            : {}),
          ...(req.system ? { system: req.system } : {}),
          messages: [{ role: "user", content: req.prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${err}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text || "";
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;
      // Sonnet 4.5 pricing: $3/1M input, $15/1M output
      const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

      return {
        content: content.trim(),
        inputTokens,
        outputTokens,
        cost,
        editorType: "ai-anthropic",
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
