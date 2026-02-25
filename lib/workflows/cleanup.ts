import type { ConfigProvider } from "@/types/provider";
import { cleanupWorkflowCommandArtifact } from "@/lib/workflows/command-artifact-sync";

/** Clean up a workflow's skill file and CLAUDE.md route entry */
export function cleanupWorkflowSkill(workflow: {
  commandName?: string | null;
  projectPath?: string | null;
  provider?: ConfigProvider | null;
}) {
  cleanupWorkflowCommandArtifact({
    provider: workflow.provider,
    commandName: workflow.commandName,
    projectPath: workflow.projectPath,
  });
}
