import type { ConfigProvider } from "@/types/provider";
import { cleanupWorkflowCommandArtifact } from "@/lib/workflows/command-artifact-sync";
import { detachAttachmentsForTarget } from "@/lib/db/instruction-files";

/** Clean up a workflow's generated artifacts and instruction attachments. */
export function cleanupWorkflowSkill(workflow: {
  name?: string | null;
  commandName?: string | null;
  projectPath?: string | null;
  provider?: ConfigProvider | null;
}) {
  cleanupWorkflowCommandArtifact({
    provider: workflow.provider,
    commandName: workflow.commandName,
    projectPath: workflow.projectPath,
  });

  if (workflow.name) {
    detachAttachmentsForTarget("workflow", workflow.name);
  }
}
