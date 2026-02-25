export type WorkflowNodeStatus =
  | "unconfirmed"
  | "ready"
  | "running"
  | "completed"
  | "error";

export interface WorkflowNodeOverrides {
  systemPrompt?: string;
  model?: string;
  description?: string;
}

export interface WorkflowNode {
  id: string;
  label: string;
  taskDescription: string;
  agentName: string | null;
  model?: string;
  skills?: string[];
  status: WorkflowNodeStatus;
  position: { x: number; y: number };
  dependsOn: string[];
  overrides?: WorkflowNodeOverrides;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

import type { ConfigProvider } from "./provider";

export interface Workflow {
  id: string;
  provider?: ConfigProvider;
  name: string;
  description: string;
  generatedPlan: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  cwd: string;
  swarmId: string | null;
  commandName: string | null;
  commandDescription: string | null;
  activationContext: string | null;
  autoSkillEnabled: boolean;
  projectId?: string;
  projectPath?: string;
  createdAt: string;
  scopedAgents?: WorkflowScopedAgent[];
  updatedAt: string;
}

export interface WorkflowScopedAgent {
  id: string;
  workflowId: string;
  name: string;
  description: string;
  model?: string;
  effort?: string;
  tools: string[];
  disallowedTools: string[];
  color?: string;
  icon?: string;
  category?: string;
  prompt: string;
  skills: string[];
  createdAt: string;
  updatedAt: string;
}
