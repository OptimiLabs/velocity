import type { Workflow } from "@/types/workflow";
import { buildCommandPrompt } from "@/lib/workflows/command-prompt";

/** Compose a launch-ready workflow prompt for console execution. */
export function composeWorkflowPrompt(workflow: Workflow): string {
  return buildCommandPrompt(workflow);
}
