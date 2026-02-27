"use client";

import { useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { composeWorkflowPrompt } from "@/lib/workflow/prompt";
import { composeAgentLaunchPrompt } from "@/lib/agents/launch-prompt";
import { DEFAULT_CONSOLE_CWD, resolveConsoleCwd } from "@/lib/console/cwd";
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
  provider?: ConfigProvider;
  model?: string;
  effort?: "low" | "medium" | "high";
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  scope?: "global" | "project" | "workflow";
  projectPath?: string;
};

type ProjectCandidate = {
  path?: string | null;
  realPath?: string | null;
};

function normalizePathForMatch(value: string): string {
  return value.replace(/\\/g, "/");
}

const LAUNCH_QUERY_KEYS = [
  "agent",
  "workflow",
  "resume",
  "provider",
  "projectPath",
  "cwd",
];

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

function isLaunchableAgent(value: unknown): value is LaunchableAgent {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { name?: unknown }).name === "string";
}

function mergeAgentDetail(
  base: LaunchableAgent,
  detail: LaunchableAgent | null,
): LaunchableAgent {
  if (!detail) return base;
  return {
    ...base,
    ...detail,
    prompt: typeof detail.prompt === "string" ? detail.prompt : base.prompt,
  };
}

function removeLaunchParams(search: string, pathname: string): string {
  const params = new URLSearchParams(search);
  for (const key of LAUNCH_QUERY_KEYS) {
    params.delete(key);
  }
  const next = params.toString();
  return next ? `${pathname}?${next}` : pathname;
}

/**
 * Auto-launch agent session from ?agent=, ?workflow=, or ?resume= query params.
 * Clears the query param from the URL immediately after reading it.
 */
export function useAgentLaunch(
  createSession: (opts: {
    cwd: string;
    label?: string;
    prompt?: string;
    provider?: ConfigProvider;
    model?: string;
    effort?: "low" | "medium" | "high";
    claudeSessionId?: string;
    agentName?: string;
    source?: "user" | "auto";
  }) => string | null,
) {
  const searchParams = useSearchParams();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const search = searchParams.toString();
  const lastLaunchSignature = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const agentName = params.get("agent")?.trim();
    const workflowId = params.get("workflow")?.trim();
    const resumeId = params.get("resume")?.trim();

    if (!agentName && !workflowId && !resumeId) {
      lastLaunchSignature.current = null;
      return;
    }

    const provider = parseProvider(params.get("provider"));
    const projectPath = params.get("projectPath")?.trim() || undefined;
    const launchSignature = [
      agentName ? `agent:${agentName.toLowerCase()}` : "",
      workflowId ? `workflow:${workflowId}` : "",
      resumeId ? `resume:${resumeId}` : "",
      provider ?? "",
      projectPath ?? "",
      params.get("cwd") ?? "",
    ].join("|");

    // Prevent duplicate launches under StrictMode/effect re-runs.
    if (lastLaunchSignature.current === launchSignature) return;
    lastLaunchSignature.current = launchSignature;
    const clearLaunchParams = () => {
      router.replace(removeLaunchParams(search, pathname));
    };

    let cancelled = false;

    if (agentName) {
      const providersToQuery = provider ? [provider] : PROVIDERS;
      void Promise.all([
        Promise.all(
          providersToQuery.map(async (p) => {
            try {
              const res = await fetch(`/api/agents?provider=${p}&scope=all`);
              if (!res.ok) return [] as LaunchableAgent[];
              const data = await res.json();
              return Array.isArray(data)
                ? (data as LaunchableAgent[]).map((agent) => ({
                    ...agent,
                    provider: agent.provider ?? p,
                  }))
                : [];
            } catch {
              return [] as LaunchableAgent[];
            }
          }),
        ).then((allAgents) => allAgents.flat()),
        fetch("/api/projects")
          .then((r) => r.json())
          .then((d) => d.projects ?? d)
          .catch(() => []),
      ])
        .then(async ([agents, projects]) => {
          if (cancelled) return;
          const byName = agents.filter(
            (a) => a.name?.toLowerCase() === agentName.toLowerCase(),
          );
          const scopedMatch = projectPath
            ? byName.find((a) => a.projectPath === projectPath)
            : undefined;
          const defaultMatch = byName.find((a) => a.scope !== "project");
          const selected = scopedMatch ?? defaultMatch ?? byName[0];
          if (!selected) {
            toast.error(`Agent "${agentName}" not found`);
            return;
          }
          const selectedProvider = selected.provider ?? provider ?? "claude";
          const detailParams = new URLSearchParams();
          detailParams.set("provider", selectedProvider);
          if (selected.scope === "project" && selected.projectPath) {
            detailParams.set("projectPath", selected.projectPath);
          }
          const detailQuery = detailParams.toString();
          const detail = await fetch(
            `/api/agents/${encodeURIComponent(selected.name)}${detailQuery ? `?${detailQuery}` : ""}`,
          )
            .then(async (r) => {
              if (!r.ok) return null;
              try {
                const data = await r.json();
                return isLaunchableAgent(data) ? data : null;
              } catch {
                return null;
              }
            })
            .catch(() => null);

          if (cancelled) return;
          const agent = mergeAgentDetail(selected, detail);
          const fallbackCwd = resolveFallbackCwd(
            Array.isArray(projects) ? (projects as ProjectCandidate[]) : [],
          );
          const cwd = agent.projectPath || fallbackCwd;
          createSession({
            cwd,
            label: agent.name,
            prompt: composeAgentLaunchPrompt(agent),
            provider: agent.provider ?? selectedProvider,
            model: agent.model,
            effort: agent.effort,
            agentName: agent.name,
            source: "auto",
          });
          clearLaunchParams();
        })
        .catch(() => {
          if (!cancelled) {
            toast.error(`Failed to launch agent "${agentName}"`);
            clearLaunchParams();
          }
        });

      return () => {
        cancelled = true;
      };
    }

    if (resumeId) {
      createSession({
        cwd: resolveConsoleCwd(params.get("cwd")),
        label: `Resume ${resumeId.slice(0, 8)}`,
        provider: "claude",
        claudeSessionId: resumeId,
        source: "auto",
      });
      clearLaunchParams();
      return;
    }

    if (workflowId) {
      void Promise.all([
        fetch(`/api/workflows/${encodeURIComponent(workflowId)}`).then((r) =>
          r.ok
            ? (r.json() as Promise<Workflow>)
            : Promise.reject(new Error("Workflow not found")),
        ),
        fetch("/api/projects")
          .then((r) => r.json())
          .then((d) => d.projects ?? d)
          .catch(() => []),
      ])
        .then(([workflow, projects]) => {
          if (cancelled) return;
          const fallbackCwd = resolveFallbackCwd(
            Array.isArray(projects) ? (projects as ProjectCandidate[]) : [],
          );
          const cwd = workflow.cwd || fallbackCwd;
          createSession({
            cwd,
            label: workflow.name,
            prompt: composeWorkflowPrompt(workflow),
            provider: workflow.provider ?? provider ?? "claude",
            source: "auto",
          });
          clearLaunchParams();
        })
        .catch(() => {
          if (!cancelled) {
            toast.error("Failed to launch workflow");
            clearLaunchParams();
          }
        });

      return () => {
        cancelled = true;
      };
    }
  }, [createSession, pathname, router, search]);
}
