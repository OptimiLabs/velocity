import type {
  AIProviderAdapter,
  AICompletionRequest,
  AICompletionResponse,
} from "../ai-adapter";
import { getAIProviderKey } from "@/lib/db/instruction-files";

export class OpenAIAdapter implements AIProviderAdapter {
  readonly id = "openai";
  readonly defaultModel = "gpt-4o";
  readonly envVarKey = "OPENAI_API_KEY";

  isAvailable(): boolean {
    return !!this.getApiKey();
  }

  getApiKey(): string | null {
    return getAIProviderKey("openai") || process.env.OPENAI_API_KEY || null;
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("No OpenAI API key configured");

    const model = req.model || this.defaultModel;
    const controller = new AbortController();
    const timer = req.timeoutMs
      ? setTimeout(() => controller.abort(), req.timeoutMs)
      : null;

    try {
      const messages: Array<{ role: string; content: string }> = [];
      if (req.system) messages.push({ role: "system", content: req.system });
      messages.push({ role: "user", content: req.prompt });

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: req.maxTokens ?? 16384,
            ...(req.temperature !== undefined
              ? { temperature: req.temperature }
              : {}),
            ...(req.topP !== undefined ? { top_p: req.topP } : {}),
            messages,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${err}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const inputTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;
      // GPT-4o pricing: $2.50/1M input, $10/1M output
      const cost = (inputTokens * 2.5 + outputTokens * 10) / 1_000_000;

      return {
        content: content.trim(),
        inputTokens,
        outputTokens,
        cost,
        editorType: "ai-openai",
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
