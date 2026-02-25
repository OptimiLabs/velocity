"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { composeWorkflowPrompt } from "@/lib/workflow/prompt";
import type { Workflow } from "@/types/workflow";

type CreateSessionFn = (opts: {
  cwd: string;
  label?: string;
  prompt?: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  env?: Record<string, string>;
  claudeSessionId?: string;
  skipPermissions?: boolean;
  agentName?: string;
  source?: "user" | "auto";
}) => string | null;

/**
 * Listens for console:launch-workflow and console:launch-agent custom events.
 * Handles both direct launch (with name) and picker mode (no name).
 */
export function useConsoleLauncher(
  createSession: CreateSessionFn,
  _wsRef: React.RefObject<WebSocket | null>,
) {
  const [pickerOpen, setPickerOpen] = useState<"workflow" | "agent" | null>(
    null,
  );

  const launchAgentByName = useCallback(
    async (name: string) => {
      try {
        const [agents, projects] = await Promise.all([
          fetch("/api/agents?scope=all").then((r) => r.json()),
          fetch("/api/projects")
            .then((r) => r.json())
            .then((d) => d.projects ?? d)
            .catch(() => []),
        ]);
        const agent = agents.find(
          (a: { name: string }) => a.name.toLowerCase() === name.toLowerCase(),
        );
        if (!agent) {
          toast.error(`Agent "${name}" not found`);
          return;
        }
        const cwd = projects?.[0]?.path || "~";
        const created = createSession({
          cwd,
          label: agent.name,
          prompt: agent.prompt,
          model: agent.model,
          effort: agent.effort,
          agentName: agent.name,
        });
        if (created) {
          toast.success(`Launched agent: ${agent.name}`);
        }
      } catch {
        toast.error("Failed to launch agent");
      }
    },
    [createSession],
  );

  const launchWorkflowByName = useCallback(
    async (name: string) => {
      try {
        const [workflows, projects] = await Promise.all([
          fetch("/api/workflows").then((r) => r.json()) as Promise<Workflow[]>,
          fetch("/api/projects")
            .then((r) => r.json())
            .then((d) => d.projects ?? d)
            .catch(() => []),
        ]);
        const workflow = workflows.find(
          (w) => w.name.toLowerCase() === name.toLowerCase(),
        );
        if (!workflow) {
          toast.error(`Workflow "${name}" not found`);
          return;
        }
        const cwd = workflow.cwd || projects?.[0]?.path || "~";
        const prompt = composeWorkflowPrompt(workflow);
        const created = createSession({ cwd, label: workflow.name, prompt });
        if (created) {
          toast.success(`Launched workflow: ${workflow.name}`);
        }
      } catch {
        toast.error("Failed to launch workflow");
      }
    },
    [createSession],
  );

  // Launch an agent by its full config (from picker)
  const launchAgent = useCallback(
    (agent: {
      name: string;
      prompt: string;
      model?: string;
      effort?: "low" | "medium" | "high";
    }) => {
      (async () => {
        const projects = await fetch("/api/projects")
          .then((r) => r.json())
          .then((d) => d.projects ?? d)
          .catch(() => []);
        const cwd = projects?.[0]?.path || "~";
        const created = createSession({
          cwd,
          label: agent.name,
          prompt: agent.prompt,
          model: agent.model,
          effort: agent.effort,
          agentName: agent.name,
        });
        if (created) {
          toast.success(`Launched agent: ${agent.name}`);
        }
      })();
      setPickerOpen(null);
    },
    [createSession, setPickerOpen],
  );

  // Launch a workflow by ID (from picker)
  const launchWorkflow = useCallback(
    (id: string) => {
      (async () => {
        try {
          const [workflows, projects] = await Promise.all([
            fetch("/api/workflows").then((r) => r.json()) as Promise<
              Workflow[]
            >,
            fetch("/api/projects")
              .then((r) => r.json())
              .then((d) => d.projects ?? d)
              .catch(() => []),
          ]);
          const workflow = workflows.find((w) => w.id === id);
          if (!workflow) {
            toast.error("Workflow not found");
            return;
          }
          const cwd = workflow.cwd || projects?.[0]?.path || "~";
          const prompt = composeWorkflowPrompt(workflow);
          const created = createSession({ cwd, label: workflow.name, prompt });
          if (created) {
            toast.success(`Launched workflow: ${workflow.name}`);
          }
        } catch {
          toast.error("Failed to launch workflow");
        }
      })();
      setPickerOpen(null);
    },
    [createSession, setPickerOpen],
  );

  useEffect(() => {
    const handleWorkflow = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.name) {
        launchWorkflowByName(detail.name);
      } else {
        setPickerOpen("workflow");
      }
    };
    const handleAgent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.name) {
        launchAgentByName(detail.name);
      } else {
        setPickerOpen("agent");
      }
    };
    window.addEventListener("console:launch-workflow", handleWorkflow);
    window.addEventListener("console:launch-agent", handleAgent);
    return () => {
      window.removeEventListener("console:launch-workflow", handleWorkflow);
      window.removeEventListener("console:launch-agent", handleAgent);
    };
  }, [launchWorkflowByName, launchAgentByName]);

  return { pickerOpen, setPickerOpen, launchAgent, launchWorkflow };
}
