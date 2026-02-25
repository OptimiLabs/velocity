import type { Agent } from "@/types/agent";
import type { WorkflowScopedAgent } from "@/types/workflow";

export function scopedAgentToAgent(sa: WorkflowScopedAgent): Agent {
  return {
    name: sa.name,
    description: sa.description,
    model: sa.model,
    effort: sa.effort as Agent["effort"],
    tools: sa.tools,
    disallowedTools: sa.disallowedTools,
    color: sa.color,
    icon: sa.icon,
    category: sa.category,
    prompt: sa.prompt,
    skills: sa.skills,
    filePath: "",
    source: "custom",
    scope: "workflow",
    enabled: true,
  };
}
