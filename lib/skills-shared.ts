/**
 * Client-safe skill types and constants.
 * Separated from lib/skills.ts to avoid pulling fs/db into client bundles.
 */

import type { ConfigProvider } from "@/types/provider";

export type SkillCategory =
  | "domain-expertise"
  | "workflow-automation"
  | "mcp-enhancement";

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  "domain-expertise": "Domain Expertise",
  "workflow-automation": "Workflow Automation",
  "mcp-enhancement": "MCP Enhancement",
};

export interface CustomSkill {
  name: string;
  description?: string;
  content: string;
  isCustom?: boolean;
  disabled?: boolean;
  category?: SkillCategory;
  origin: "user" | "plugin";
  visibility: "global" | "project";
  archived: boolean;
  projectPath?: string;
  projectName?: string;
  filePath?: string;
  inheritedFrom?: string;
  workflow?: { id: string; name: string };
  provider?: ConfigProvider;
}

export type TemplateSource = "builtin" | "skill" | "agent" | "snippet";

export const CATEGORY_COLORS: Record<SkillCategory, string> = {
  "domain-expertise": "border-chart-5/30 text-chart-5",
  "workflow-automation": "border-chart-2/30 text-chart-2",
  "mcp-enhancement": "border-chart-4/30 text-chart-4",
};

export const SOURCE_COLORS: Record<TemplateSource, string> = {
  builtin: "border-chart-1/30 text-chart-1",
  skill: "border-chart-5/30 text-chart-5",
  agent: "border-chart-2/30 text-chart-2",
  snippet: "border-chart-3/30 text-chart-3",
};

export const SOURCE_LABELS: Record<TemplateSource, string> = {
  builtin: "Built-in",
  skill: "My Skills",
  agent: "Agent",
  snippet: "Snippet",
};
