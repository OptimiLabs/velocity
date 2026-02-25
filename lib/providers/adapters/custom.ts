import type {
  AIProviderAdapter,
  AICompletionRequest,
  AICompletionResponse,
} from "../ai-adapter";
import { getAIProviderKey } from "@/lib/db/instruction-files";

export class CustomAdapter implements AIProviderAdapter {
  readonly id = "custom";
  readonly defaultModel = "default";
  readonly envVarKey = "";

  isAvailable(): boolean {
    return !!this.getApiKey();
  }

  getApiKey(): string | null {
    return getAIProviderKey("custom") || null;
  }

  private async getEndpointConfig(): Promise<{
    endpointUrl: string;
    modelId: string;
  }> {
    const { getDb } = await import("@/lib/db/index");
    const db = getDb();
    const row = db
      .prepare(
        "SELECT endpoint_url, model_id FROM ai_provider_keys WHERE provider = ? AND is_active = 1",
      )
      .get("custom") as
      | { endpoint_url: string | null; model_id: string | null }
      | undefined;

    if (!row?.endpoint_url)
      throw new Error("No custom endpoint URL configured");

    return {
      endpointUrl: row.endpoint_url,
      modelId: row.model_id || "default",
    };
  }

  async complete(req: AICompletionRequest): Promise<AICompletionResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("No custom provider API key configured");

    const { endpointUrl, modelId } = await this.getEndpointConfig();
    const model = req.model || modelId;
    const controller = new AbortController();
    const timer = req.timeoutMs
      ? setTimeout(() => controller.abort(), req.timeoutMs)
      : null;

    try {
      const messages: Array<{ role: string; content: string }> = [];
      if (req.system) messages.push({ role: "system", content: req.system });
      messages.push({ role: "user", content: req.prompt });

      // OpenAI-compatible endpoint format
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: req.maxTokens ?? 16384,
          ...(req.temperature !== undefined
            ? { temperature: req.temperature }
            : {}),
          ...(req.topP !== undefined ? { top_p: req.topP } : {}),
          ...(req.topK !== undefined ? { top_k: req.topK } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Custom provider error: ${response.status} ${err}`);
      }

      const data = await response.json();
      // Support both OpenAI and Anthropic response shapes
      const content =
        data.choices?.[0]?.message?.content || data.content?.[0]?.text || "";

      return {
        content: content.trim(),
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        editorType: "ai-openai",
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
