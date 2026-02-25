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
      const contents = [{ role: "user", parts: [{ text: req.prompt }] }];
      const generationConfig: Record<string, unknown> = {
        maxOutputTokens: req.maxTokens ?? 16384,
      };
      if (req.temperature !== undefined) {
        generationConfig.temperature = req.temperature;
      }
      if (req.topP !== undefined) {
        generationConfig.topP = req.topP;
      }
      if (req.topK !== undefined) {
        generationConfig.topK = req.topK;
      }
      if (req.thinkingBudget !== undefined) {
        generationConfig.thinkingConfig = {
          thinkingBudget: req.thinkingBudget,
        };
      }
      const body: Record<string, unknown> = {
        contents,
        generationConfig,
      };
      if (req.system) {
        body.systemInstruction = { parts: [{ text: req.system }] };
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Google AI API error: ${response.status} ${err}`);
      }

      const data = await response.json();
      const candidates = data.candidates || [];
      const parts = candidates[0]?.content?.parts || [];
      const content = parts
        .map((p: { text?: string }) => p.text || "")
        .join("");
      const usage = data.usageMetadata || {};
      const inputTokens = usage.promptTokenCount || 0;
      const outputTokens = usage.candidatesTokenCount || 0;
      // Gemini 2.5 Flash pricing: $0.30/1M input, $2.50/1M output
      const cost = (inputTokens * 0.3 + outputTokens * 2.5) / 1_000_000;

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
