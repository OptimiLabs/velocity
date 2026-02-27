"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { composeWorkflowPrompt } from "@/lib/workflow/prompt";
import type { Workflow } from "@/types/workflow";
import type { ConfigProvider } from "@/types/provider";
import { composeAgentLaunchPrompt } from "@/lib/agents/launch-prompt";
import { DEFAULT_CONSOLE_CWD } from "@/lib/console/cwd";
import { useProviderScopeStore } from "@/stores/providerScopeStore";

type CreateSessionFn = (opts: {
  cwd: string;
  label?: string;
  prompt?: string;
  provider?: ConfigProvider;
  model?: string;
  effort?: "low" | "medium" | "high";
  env?: Record<string, string>;
  claudeSessionId?: string;
  skipPermissions?: boolean;
  agentName?: string;
  source?: "user" | "auto";
}) => string | null;

type ProjectCandidate = {
  path?: string | null;
  realPath?: string | null;
};

function normalizePathForMatch(value: string): string {
  return value.replace(/\\/g, "/");
}

function resolveFallbackCwd(projects: ProjectCandidate[]): string {
  for (const project of projects) {
    if (typeof project.realPath === "string" && project.realPath.trim()) {
      return project.realPath.trim();
    }
  }
  for (const project of projects) {
    const rawPath =
      typeof project.path === "string" ? project.path.trim() : "";
    if (!rawPath) continue;
    if (normalizePathForMatch(rawPath).includes("/.claude/projects/")) continue;
    return rawPath;
  }
  return DEFAULT_CONSOLE_CWD;
}

type LaunchableAgent = {
  name: string;
  prompt: string;
  provider?: ConfigProvider;
  model?: string;
  effort?: "low" | "medium" | "high";
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  scope?: "global" | "project" | "workflow";
  projectPath?: string;
};

function isLaunchableAgent(value: unknown): value is LaunchableAgent {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { name?: unknown }).name === "string";
}

/**
 * Listens for console:launch-workflow and console:launch-agent custom events.
 * Handles both direct launch (with name) and picker mode (no name).
 */
export function useConsoleLauncher(
  createSession: CreateSessionFn,
  _wsRef: React.RefObject<WebSocket | null>,
) {
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const defaultProvider: ConfigProvider = providerScope ?? "claude";
  const [pickerOpen, setPickerOpen] = useState<"workflow" | "agent" | null>(
    null,
  );

  const fetchWorkflowById = useCallback(async (id: string): Promise<Workflow | null> => {
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const workflow = (await res.json()) as Workflow;
      return workflow;
    } catch {
      return null;
    }
  }, []);

  const fetchAgentByIdentity = useCallback(
    async (
      agent: Pick<LaunchableAgent, "name" | "provider" | "scope" | "projectPath">,
    ): Promise<LaunchableAgent | null> => {
      const params = new URLSearchParams();
      params.set("provider", agent.provider ?? defaultProvider);
      if (agent.scope === "project" && agent.projectPath) {
        params.set("projectPath", agent.projectPath);
      }
      const qs = params.toString();
      try {
        const res = await fetch(
          `/api/agents/${encodeURIComponent(agent.name)}${qs ? `?${qs}` : ""}`,
        );
        if (!res.ok) return null;
        const payload = await res.json();
        return isLaunchableAgent(payload) ? payload : null;
      } catch {
        return null;
      }
    },
    [defaultProvider],
  );

  const launchAgentByName = useCallback(
    async (name: string) => {
      try {
        const [agents, projects] = await Promise.all([
          fetch("/api/agents?scope=all").then((r) => r.json()) as Promise<LaunchableAgent[]>,
          fetch("/api/projects")
            .then((r) => r.json())
            .then((d) => d.projects ?? d)
            .catch(() => []),
        ]);
        const candidates = agents.filter(
          (a: { name: string }) => a.name.toLowerCase() === name.toLowerCase(),
        );
        const preferred =
          candidates.find((a) => a.scope !== "project") ?? candidates[0];
        if (!preferred) {
          toast.error(`Agent "${name}" not found`);
          return;
        }
        const detailed = (await fetchAgentByIdentity(preferred)) ?? preferred;
        const fallbackCwd = resolveFallbackCwd(
          Array.isArray(projects) ? (projects as ProjectCandidate[]) : [],
        );
        const cwd = detailed.projectPath || fallbackCwd;
        const prompt = composeAgentLaunchPrompt(detailed);
        const created = createSession({
          cwd,
          label: detailed.name,
          prompt,
          provider: detailed.provider ?? preferred.provider ?? defaultProvider,
          model: detailed.model,
          effort: detailed.effort,
          agentName: detailed.name,
        });
        if (created) {
          toast.success(`Launched agent: ${detailed.name}`);
        }
      } catch {
        toast.error("Failed to launch agent");
      }
    },
    [createSession, defaultProvider, fetchAgentByIdentity],
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
        const detailedWorkflow = (await fetchWorkflowById(workflow.id)) ?? workflow;
        const fallbackCwd = resolveFallbackCwd(
          Array.isArray(projects) ? (projects as ProjectCandidate[]) : [],
        );
        const cwd = detailedWorkflow.cwd || fallbackCwd;
        const prompt = composeWorkflowPrompt(detailedWorkflow);
        const created = createSession({
          cwd,
          label: workflow.name,
          prompt,
          provider: detailedWorkflow.provider ?? defaultProvider,
        });
        if (created) {
          toast.success(`Launched workflow: ${workflow.name}`);
        }
      } catch {
        toast.error("Failed to launch workflow");
      }
    },
    [createSession, defaultProvider, fetchWorkflowById],
  );

  // Launch an agent by its full config (from picker)
  const launchAgent = useCallback(
    (agent: LaunchableAgent) => {
      (async () => {
        const [projects, detailed] = await Promise.all([
          fetch("/api/projects")
            .then((r) => r.json())
            .then((d) => d.projects ?? d)
            .catch(() => []),
          fetchAgentByIdentity(agent),
        ]);
        const resolved = detailed ?? agent;
        const fallbackCwd = resolveFallbackCwd(
          Array.isArray(projects) ? (projects as ProjectCandidate[]) : [],
        );
        const cwd = resolved.projectPath || fallbackCwd;
        const prompt = composeAgentLaunchPrompt(resolved);
        const created = createSession({
          cwd,
          label: resolved.name,
          prompt,
          provider: resolved.provider ?? agent.provider ?? defaultProvider,
          model: resolved.model,
          effort: resolved.effort,
          agentName: resolved.name,
        });
        if (created) {
          toast.success(`Launched agent: ${resolved.name}`);
        }
      })();
      setPickerOpen(null);
    },
    [createSession, defaultProvider, fetchAgentByIdentity, setPickerOpen],
  );

  // Launch a workflow by ID (from picker)
  const launchWorkflow = useCallback(
    (id: string) => {
      (async () => {
        try {
          const [workflow, projects] = await Promise.all([
            fetchWorkflowById(id),
            fetch("/api/projects")
              .then((r) => r.json())
              .then((d) => d.projects ?? d)
              .catch(() => []),
          ]);
          if (!workflow) {
            toast.error("Workflow not found");
            return;
          }
          const fallbackCwd = resolveFallbackCwd(
            Array.isArray(projects) ? (projects as ProjectCandidate[]) : [],
          );
          const cwd = workflow.cwd || fallbackCwd;
          const prompt = composeWorkflowPrompt(workflow);
          const created = createSession({
            cwd,
            label: workflow.name,
            prompt,
            provider: workflow.provider ?? defaultProvider,
          });
          if (created) {
            toast.success(`Launched workflow: ${workflow.name}`);
          }
        } catch {
          toast.error("Failed to launch workflow");
        }
      })();
      setPickerOpen(null);
    },
    [createSession, defaultProvider, fetchWorkflowById, setPickerOpen],
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
