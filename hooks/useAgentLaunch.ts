"use client";

import { useRef, useEffect } from "react";
import { composeWorkflowPrompt } from "@/lib/workflow/prompt";
import type { Workflow } from "@/types/workflow";
import type { ConfigProvider } from "@/types/provider";

const PROVIDERS: ConfigProvider[] = ["claude", "codex", "gemini"];

function parseProvider(value: string | null): ConfigProvider | null {
  if (!value) return null;
  return PROVIDERS.includes(value as ConfigProvider)
    ? (value as ConfigProvider)
    : null;
}

type LaunchableAgent = {
  name: string;
  prompt: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  scope?: "global" | "project" | "workflow";
  projectPath?: string;
};

/**
 * Auto-launch agent session from ?agent=, ?workflow=, or ?resume= query params.
 * Clears the query param from the URL immediately after reading it.
 */
export function useAgentLaunch(
  createSession: (opts: {
    cwd: string;
    label?: string;
    prompt?: string;
    model?: string;
    effort?: "low" | "medium" | "high";
    claudeSessionId?: string;
    agentName?: string;
    source?: "user" | "auto";
  }) => string | null,
) {
  // Auto-launch agent session from ?agent= query param
  const agentLaunched = useRef(false);
  useEffect(() => {
    if (agentLaunched.current) return;
    const params = new URLSearchParams(window.location.search);
    const agentName = params.get("agent")?.trim();
    if (!agentName) return;
    agentLaunched.current = true;
    const provider = parseProvider(params.get("provider"));
    const projectPath = params.get("projectPath")?.trim() || undefined;

    // Clear the param from URL immediately
    window.history.replaceState({}, "", "/");

    // Fetch agent config + default cwd, then create session
    const providersToQuery = provider ? [provider] : PROVIDERS;
    Promise.all([
      Promise.all(
        providersToQuery.map(async (p) => {
          try {
            const res = await fetch(`/api/agents?provider=${p}&scope=all`);
            if (!res.ok) return [] as LaunchableAgent[];
            const data = await res.json();
            return Array.isArray(data) ? (data as LaunchableAgent[]) : [];
          } catch {
            return [] as LaunchableAgent[];
          }
        }),
      ).then((allAgents) => allAgents.flat()),
      fetch("/api/projects")
        .then((r) => r.json())
        .then((d) => d.projects ?? d)
        .catch(() => []),
    ]).then(([agents, projects]) => {
      const byName = agents.filter(
        (a) => a.name?.toLowerCase() === agentName.toLowerCase(),
      );
      const scopedMatch = projectPath
        ? byName.find((a) => a.projectPath === projectPath)
        : undefined;
      const defaultMatch = byName.find((a) => a.scope !== "project");
      const agent = scopedMatch ?? defaultMatch ?? byName[0];
      if (!agent) return;
      const cwd = agent.projectPath || projects?.[0]?.path || "~";
      createSession({
        cwd,
        label: agent.name,
        prompt: agent.prompt,
        model: agent.model,
        effort: agent.effort,
        agentName: agent.name,
        source: "auto",
      });
    });
  }, [createSession]);

  // Auto-resume session from ?resume= query param
  const resumeLaunched = useRef(false);
  useEffect(() => {
    if (resumeLaunched.current) return;
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    const cwd = params.get("cwd") || "~";
    if (!resumeId) return;
    resumeLaunched.current = true;
    window.history.replaceState({}, "", "/");
    createSession({
      cwd,
      label: `Resume ${resumeId.slice(0, 8)}`,
      claudeSessionId: resumeId,
      source: "auto",
    });
  }, [createSession]);

  // Auto-launch workflow from ?workflow= query param
  const workflowLaunched = useRef(false);
  useEffect(() => {
    if (workflowLaunched.current) return;
    const params = new URLSearchParams(window.location.search);
    const workflowId = params.get("workflow");
    if (!workflowId) return;
    workflowLaunched.current = true;
    window.history.replaceState({}, "", "/");

    Promise.all([
      fetch("/api/workflows").then((r) => r.json()) as Promise<Workflow[]>,
      fetch("/api/projects")
        .then((r) => r.json())
        .then((d) => d.projects ?? d)
        .catch(() => []),
    ]).then(([workflows, projects]) => {
      const workflow = workflows.find((w) => w.id === workflowId);
      if (!workflow) return;
      const cwd = workflow.cwd || projects?.[0]?.path || "~";
      const prompt = composeWorkflowPrompt(workflow);
      createSession({ cwd, label: workflow.name, prompt, source: "auto" });
    });
  }, [createSession]);
}
