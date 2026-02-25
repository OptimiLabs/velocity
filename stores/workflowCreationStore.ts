import { create } from "zustand";

interface PendingAIIntent {
  prompt: string;
  agentMode: "existing" | "ai-create";
  selectedAgents?: string[];
}

interface WorkflowCreationState {
  pendingAIIntent: PendingAIIntent | null;
  setPendingAIIntent: (intent: PendingAIIntent) => void;
  clearPendingAIIntent: () => void;
}

export const useWorkflowCreationStore = create<WorkflowCreationState>()(
  (set) => ({
    pendingAIIntent: null,
    setPendingAIIntent: (pendingAIIntent) => set({ pendingAIIntent }),
    clearPendingAIIntent: () => set({ pendingAIIntent: null }),
  }),
);
