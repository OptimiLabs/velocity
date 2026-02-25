export type InstructionFileType =
  | "CLAUDE.md"
  | "agents.md"
  | "skill.md"
  | "other.md"
  | "knowledge.md";
export type InstructionSource = "auto" | "manual";
export type AttachmentTargetType =
  | "agent"
  | "workflow"
  | "role"
  | "session"
  | "global";
export type AIProviderType = "anthropic" | "openai" | "google" | "custom";
export type ProviderSlug =
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "local";
export type EditorType =
  | "manual"
  | "ai-anthropic"
  | "ai-google"
  | "ai-openai"
  | "ai-google"
  | "ai-claude-cli";

export interface InstructionFile {
  id: string;
  filePath: string;
  fileType: InstructionFileType;
  projectPath: string | null;
  projectId: string | null;
  fileName: string;
  content: string;
  contentHash: string | null;
  tokenCount: number;
  isEditable: boolean;
  lastIndexedAt: string | null;
  fileMtime: string | null;
  source: InstructionSource;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  // Knowledge-specific (null/default for non-knowledge files)
  category: string | null;
  slug: string | null;
  title: string | null;
  description: string;
  charCount: number;
  isActive: boolean;
}

export interface InstructionAttachment {
  instructionId: string;
  targetType: AttachmentTargetType;
  targetName: string;
  enabled: boolean;
  priority: number;
  createdAt: string;
}

export interface AIProvider {
  id: string;
  provider: AIProviderType;
  providerSlug: ProviderSlug | null;
  displayName: string;
  apiKeyEncrypted: string;
  modelId: string | null;
  endpointUrl: string | null;
  isActive: boolean;
  temperature: number | null;
  topK: number | null;
  topP: number | null;
  thinkingBudget: number | null;
  maxTokens: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EditRequest {
  provider:
    | AIProviderType
    | "claude-cli"
    | "codex-cli"
    | "openrouter"
    | "local";
  prompt: string;
  originalContent: string;
  instructionId: string;
}

export interface EditResult {
  content: string;
  tokensUsed: number;
  cost: number;
  editorType: EditorType;
}

export type ComposeMode = "compose" | "summarize";

export interface ComposeRequest {
  sourceIds: string[];
  prompt: string;
  mode: ComposeMode;
  provider?:
    | AIProviderType
    | "claude-cli"
    | "codex-cli"
    | "openrouter"
    | "local";
  outputPath: string;
  outputFileName?: string;
}

export interface ComposeResult {
  content: string;
  filePath: string;
  tokensUsed: number;
  cost: number;
}
