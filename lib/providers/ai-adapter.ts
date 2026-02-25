import type { EditorType } from "@/types/instructions";

export interface AICompletionRequest {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  thinkingBudget?: number;
  timeoutMs?: number;
}

export interface AICompletionResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  editorType: EditorType;
}

export interface AIProviderAdapter {
  readonly id: string;
  readonly defaultModel: string;
  readonly envVarKey: string;

  isAvailable(): boolean;
  getApiKey(): string | null;
  complete(req: AICompletionRequest): Promise<AICompletionResponse>;
}
