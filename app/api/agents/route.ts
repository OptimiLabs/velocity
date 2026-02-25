import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  listAgents,
  saveAgent,
  listProjectAgents,
  saveProjectAgent,
  setAgentDisabled,
  validateAgentName,
} from "@/lib/agents/parser";
import { AGENTS_DIR } from "@/lib/claude-paths";
import { AGENT_PRESETS } from "@/lib/agents/presets";
import {
  getAllAgentMeta,
  toggleEnabled,
  attachSkill,
  detachSkill,
  upsertAgentMeta,
} from "@/lib/db/agent-catalog";
import { listWorkflows } from "@/lib/db/workflows";
import { getDb } from "@/lib/db";
import type { Agent } from "@/types/agent";
import type { ConfigProvider } from "@/types/provider";
import { apiLog } from "@/lib/logger";
import {
  listProviderAgents,
  saveProviderAgent,
  setProviderAgentDisabled,
} from "@/lib/providers/agent-files";

function jsonError(
  status: number,
  error: string,
  code: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      error,
      code,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

function isConfigProvider(value: string): value is ConfigProvider {
  return value === "claude" || value === "codex" || value === "gemini";
}

function parseProvider(value: unknown): ConfigProvider | null {
  if (typeof value !== "string") return null;
  return isConfigProvider(value) ? value : null;
}

function normalizeAreaPath(value: unknown): { value?: string; error?: string } {
  if (typeof value !== "string") return { value: undefined };
  const trimmed = value.trim();
  if (!trimmed) return { value: undefined };

  const normalized = trimmed.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("~/") ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return {
      error: "areaPath must be a relative path within the selected project",
    };
  }

  const segments: string[] = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      return {
        error: "areaPath must stay within the selected project",
      };
    }
    segments.push(segment);
  }

  if (segments.length === 0) return { value: undefined };
  return { value: segments.join("/") };
}

function usageKey(provider: ConfigProvider, agentName: string): string {
  return `${provider}::${agentName}`;
}

function metaKey(
  provider: ConfigProvider,
  agentName: string,
  projectPath?: string | null,
): string {
  return `${provider}::${projectPath ?? ""}::${agentName}`;
}

function listProjectRows(projectId?: string): Array<{
  id: string;
  name: string;
  path: string;
}> {
  const db = getDb();
  if (projectId) {
    const row = db
      .prepare("SELECT id, name, path FROM projects WHERE id = ?")
      .get(projectId) as { id: string; name: string; path: string } | undefined;
    return row ? [row] : [];
  }
  return db
    .prepare("SELECT id, name, path FROM projects")
    .all() as { id: string; name: string; path: string }[];
}

function getUsageMap(): Map<
  string,
  { usageCount: number; lastUsed?: number; avgCost?: number }
> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
        cs.agent_name,
        CASE
          WHEN s.provider IN ('claude', 'codex', 'gemini') THEN s.provider
          ELSE 'claude'
        END AS provider,
        COUNT(*) AS usage_count,
        MAX(cs.last_activity_at) AS last_used,
        AVG(s.total_cost) AS avg_cost
      FROM console_sessions cs
      LEFT JOIN sessions s ON cs.claude_session_id = s.id
      WHERE cs.agent_name IS NOT NULL
      GROUP BY provider, cs.agent_name`,
    )
    .all() as {
    agent_name: string;
    provider: string | null;
    usage_count: number;
    last_used: number | null;
    avg_cost: number | null;
  }[];

  const map = new Map<string, { usageCount: number; lastUsed?: number; avgCost?: number }>();
  for (const row of rows) {
    const provider = parseProvider(row.provider) ?? "claude";
    map.set(usageKey(provider, row.agent_name), {
      usageCount: row.usage_count,
      lastUsed: row.last_used ?? undefined,
      avgCost: row.avg_cost ?? undefined,
    });
  }
  return map;
}

function getWorkflowMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const workflows = listWorkflows();
  for (const workflow of workflows) {
    const workflowProvider = parseProvider(workflow.provider) ?? "claude";
    for (const node of workflow.nodes) {
      if (!node.agentName) continue;
      const key = usageKey(workflowProvider, node.agentName);
      const names = map.get(key) ?? [];
      if (!names.includes(workflow.name)) names.push(workflow.name);
      map.set(key, names);
    }
  }
  return map;
}

function enrichAgentsWithStatsAndWorkflows(agents: Agent[]) {
  const usageMap = getUsageMap();
  const workflowMap = getWorkflowMap();
  for (const agent of agents) {
    const provider = agent.provider ?? "claude";
    const key = usageKey(provider, agent.name);
    const usage = usageMap.get(key);
    if (usage) {
      agent.usageCount = usage.usageCount;
      agent.lastUsed = usage.lastUsed;
      agent.avgCost = usage.avgCost;
    }
    agent.workflowNames = workflowMap.get(key) ?? [];
  }
}

export async function GET(request: NextRequest) {
  const providerParam = request.nextUrl.searchParams.get("provider");
  if (providerParam && !isConfigProvider(providerParam)) {
    return jsonError(400, "Invalid provider", "invalid_provider", {
      provider: providerParam,
    });
  }
  const provider = (providerParam ?? "claude") as ConfigProvider;

  const scope = request.nextUrl.searchParams.get("scope") as
    | "all"
    | "global"
    | "project"
    | null;
  const projectId = request.nextUrl.searchParams.get("projectId") || undefined;
  const allMeta = getAllAgentMeta({ provider });
  const metaMap = new Map(
    allMeta.map((meta) => [
      metaKey(meta.provider, meta.agentName, meta.projectPath),
      meta,
    ]),
  );

  if (provider !== "claude") {
    const globalAgents: Agent[] = listProviderAgents(provider).map((agent) => ({
      ...agent,
      provider,
      source: "custom" as const,
      scope: "global" as const,
    }));

    const projectAgents: Agent[] = [];
    if (scope === "all" || scope === "project") {
      for (const project of listProjectRows(projectId)) {
        const agents = listProviderAgents(provider, project.path);
        projectAgents.push(
          ...agents.map((agent) => ({
            ...agent,
            provider,
            source: "custom" as const,
            scope: "project" as const,
            projectPath: project.path,
            projectName: project.name || path.basename(project.path),
          })),
        );
      }
    }

    let result = [...globalAgents, ...projectAgents];
    if (scope === "global") {
      result = result.filter((agent) => agent.scope !== "project");
    } else if (scope === "project") {
      result = result.filter((agent) => agent.scope === "project");
    }

    result = result.map((agent) => {
      const scopedMeta = metaMap.get(
        metaKey(
          provider,
          agent.name,
          agent.scope === "project" ? agent.projectPath : null,
        ),
      );
      const fallbackMeta = metaMap.get(metaKey(provider, agent.name, null));
      const meta = scopedMeta ?? fallbackMeta;
      return {
        ...agent,
        source: meta?.source ?? agent.source ?? "custom",
        enabled: agent.enabled ?? meta?.enabled ?? true,
        skills: meta?.skills ?? [],
        sourceUrl: meta?.sourceUrl ?? undefined,
      };
    });

    enrichAgentsWithStatsAndWorkflows(result);
    return NextResponse.json(result);
  }

  const customAgents: Agent[] = listAgents().map((agent) => ({
    ...agent,
    provider: "claude" as const,
    source: "custom" as const,
    scope: "global" as const,
  }));

  const projectAgents: Agent[] = [];
  if (scope === "all" || scope === "project") {
    for (const project of listProjectRows(projectId)) {
      const agents = listProjectAgents(project.path);
      projectAgents.push(
        ...agents.map((agent) => ({
          ...agent,
          provider: "claude" as const,
          source: "custom" as const,
          scope: "project" as const,
          projectPath: project.path,
          projectName: project.name || path.basename(project.path),
        })),
      );
    }
  }

  const presetAgents: Agent[] = AGENT_PRESETS.map((preset) => ({
    name: preset.name,
    description: preset.description,
    model: preset.model,
    effort: preset.effort,
    tools: preset.tools,
    color: preset.color,
    category: preset.category,
    prompt: preset.prompt,
    filePath: "",
    tags: preset.tags,
    icon: preset.icon,
    provider: "claude" as const,
    source: "preset" as const,
  }));

  const allCustomAgents = [...customAgents, ...projectAgents];
  const customNames = new Set(allCustomAgents.map((agent) => agent.name));
  const merged: Agent[] = [];

  for (const agent of allCustomAgents) {
    const scopedMeta = metaMap.get(
      metaKey(
        "claude",
        agent.name,
        agent.scope === "project" ? agent.projectPath : null,
      ),
    );
    const fallbackMeta = metaMap.get(metaKey("claude", agent.name, null));
    const meta = scopedMeta ?? fallbackMeta;
    merged.push({
      ...agent,
      source: meta?.source === "marketplace" ? "marketplace" : "custom",
      enabled: agent.enabled ?? meta?.enabled ?? true,
      skills: meta?.skills ?? [],
      sourceUrl: meta?.sourceUrl ?? undefined,
    });
  }

  for (const agent of presetAgents) {
    if (!customNames.has(agent.name)) {
      const meta = metaMap.get(metaKey("claude", agent.name, null));
      merged.push({
        ...agent,
        enabled: meta?.enabled ?? true,
        skills: meta?.skills ?? [],
      });
    }
  }

  let result = merged;
  if (scope === "global") {
    result = merged.filter((agent) => agent.scope !== "project");
  } else if (scope === "project") {
    result = merged.filter((agent) => agent.scope === "project");
  }

  enrichAgentsWithStatsAndWorkflows(result);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const requestUrl = new URL(request.url);
    const rawProvider =
      typeof body.provider === "string"
        ? body.provider
        : requestUrl.searchParams.get("provider");
    if (rawProvider && !isConfigProvider(rawProvider)) {
      return jsonError(400, "Invalid provider", "invalid_provider", {
        provider: rawProvider,
      });
    }
    const provider = (rawProvider as ConfigProvider | null) ?? "claude";
    const projectPath =
      typeof body.projectPath === "string" && body.projectPath.trim()
        ? body.projectPath.trim()
        : undefined;

    if (
      typeof body.name === "string" &&
      typeof body.enabled === "boolean" &&
      body.prompt === undefined &&
      body.attachSkill === undefined &&
      body.detachSkill === undefined &&
      body.catalogMeta === undefined
    ) {
      toggleEnabled(body.name, body.enabled, { provider, projectPath });
      if (provider === "claude") {
        const moved = setAgentDisabled(body.name, body.enabled === false);
        return NextResponse.json({ success: true, moved, provider });
      }
      const moved = setProviderAgentDisabled(
        provider,
        body.name,
        body.enabled === false,
        projectPath,
      );
      return NextResponse.json({ success: true, moved, provider });
    }

    if (typeof body.name === "string" && typeof body.attachSkill === "string") {
      attachSkill(body.name, body.attachSkill, { provider, projectPath });
      return NextResponse.json({ success: true });
    }

    if (typeof body.name === "string" && typeof body.detachSkill === "string") {
      detachSkill(body.name, body.detachSkill, { provider, projectPath });
      return NextResponse.json({ success: true });
    }

    if (
      typeof body.name === "string" &&
      body.catalogMeta &&
      typeof body.catalogMeta === "object"
    ) {
      upsertAgentMeta(
        body.name,
        body.catalogMeta as Parameters<typeof upsertAgentMeta>[1],
        { provider, projectPath },
      );
      return NextResponse.json({ success: true });
    }

    if (typeof body.name !== "string" || !body.name.trim()) {
      return jsonError(400, "name is required", "missing_agent_name");
    }
    if (typeof body.prompt !== "string" || !body.prompt.trim()) {
      return jsonError(400, "prompt is required", "missing_agent_prompt");
    }

    const nameError = validateAgentName(body.name);
    if (nameError) {
      return jsonError(400, nameError, "invalid_agent_name");
    }

    const scope = body.scope === "project" ? "project" : "global";
    if (scope === "project" && !projectPath) {
      return jsonError(
        400,
        "projectPath is required when scope=project",
        "project_path_required",
      );
    }

    const normalizedAreaPath =
      scope === "project"
        ? normalizeAreaPath(body.areaPath)
        : { value: undefined as string | undefined };
    if (normalizedAreaPath.error) {
      return jsonError(400, normalizedAreaPath.error, "invalid_area_path", {
        areaPath: body.areaPath,
      });
    }
    const areaPath = scope === "project" ? normalizedAreaPath.value : undefined;

    let project: { id: string; name: string } | undefined;
    if (scope === "project" && projectPath) {
      const db = getDb();
      project = db
        .prepare("SELECT id, name FROM projects WHERE path = ?")
        .get(projectPath) as { id: string; name: string } | undefined;
      if (!project) {
        return jsonError(
          400,
          "Unknown projectPath; select a project from the indexed project list.",
          "unknown_project_path",
          { projectPath },
        );
      }
    }

    const agent: Agent = {
      name: body.name,
      provider,
      description: typeof body.description === "string" ? body.description : "",
      model: typeof body.model === "string" ? body.model : undefined,
      effort:
        body.effort === "low" || body.effort === "medium" || body.effort === "high"
          ? body.effort
          : undefined,
      tools: Array.isArray(body.tools)
        ? body.tools.filter((tool): tool is string => typeof tool === "string")
        : undefined,
      disallowedTools: Array.isArray(body.disallowedTools)
        ? body.disallowedTools.filter((tool): tool is string => typeof tool === "string")
        : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
      icon: typeof body.icon === "string" ? body.icon : undefined,
      category: typeof body.category === "string" ? body.category : undefined,
      prompt: body.prompt,
      filePath:
        typeof body.filePath === "string" && body.filePath.trim()
          ? body.filePath
          : provider === "claude"
            ? scope === "project" && projectPath
              ? path.join(projectPath, ".claude", "agents", `${body.name}.md`)
              : path.join(AGENTS_DIR, `${body.name}.md`)
            : "",
      scope,
      projectPath: scope === "project" ? projectPath : undefined,
      areaPath,
    };

    if (provider === "claude") {
      if (scope === "project" && projectPath) {
        saveProjectAgent(projectPath, agent);
        upsertAgentMeta(
          agent.name,
          { source: "custom", provider },
          {
            provider,
            projectId: project?.id ?? null,
            projectPath,
          },
        );
      } else {
        saveAgent(agent);
        upsertAgentMeta(agent.name, { source: "custom", provider }, { provider });
      }
    } else {
      saveProviderAgent(provider, agent, scope === "project" ? projectPath : undefined);
      upsertAgentMeta(
        agent.name,
        { source: "custom", provider },
        {
          provider,
          projectId: project?.id ?? null,
          projectPath: scope === "project" ? (projectPath ?? null) : null,
        },
      );
    }

    return NextResponse.json({
      success: true,
      provider,
      ...(scope === "project" && projectPath ? { projectPath } : {}),
      ...(scope === "project" && areaPath ? { areaPath } : {}),
    });
  } catch (error) {
    apiLog.error("POST /api/agents failed", error);
    return jsonError(
      500,
      error instanceof Error ? error.message : String(error),
      "save_agent_failed",
    );
  }
}
