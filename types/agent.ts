import type { ConfigProvider } from "./provider";

export interface Agent {
  name: string;
  provider?: ConfigProvider;
  description: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  tools?: string[];
  disallowedTools?: string[];
  color?: string;
  category?: string;
  prompt: string;
  filePath: string;
  // Extended fields (populated from DB at query time)
  prePrompts?: string[];
  postPrompts?: string[];
  tags?: string[];
  usageCount?: number;
  lastUsed?: number;
  avgCost?: number;
  effectiveness?: number;
  // Catalog fields
  source?: "custom" | "preset" | "marketplace";
  enabled?: boolean;
  sourceUrl?: string;
  skills?: string[];
  icon?: string;
  workflowNames?: string[];
  // Project scoping
  scope?: "global" | "project" | "workflow";
  projectId?: string;
  projectPath?: string;
  areaPath?: string;
  projectName?: string;
}

export interface AgentPreset {
  name: string;
  description: string;
  model: string;
  effort: "low" | "medium" | "high";
  tools: string[];
  color: string;
  category?: string;
  prompt: string;
  tags: string[];
  icon: string;
}
