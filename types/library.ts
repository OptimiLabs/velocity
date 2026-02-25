export interface PromptSnippet {
  id: string;
  name: string;
  content: string;
  category: "pre-prompt" | "post-prompt" | "claude-md" | "general";
  tags: string[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptAttachment {
  promptId: string;
  targetType: "agent" | "role" | "session";
  targetName: string;
  position: "before" | "after";
  sortOrder: number;
}
