import { getDb } from "./index";
import type { ConfigProvider } from "@/types/provider";

const META_KEY_PREFIX = "v2";

interface AgentMeta {
  agentName: string;
  provider: ConfigProvider;
  source: "custom" | "preset" | "marketplace";
  enabled: boolean;
  sourceUrl: string | null;
  sourceVersion: string | null;
  installedAt: number | null;
  skills: string[];
  updatedAt: string;
  projectId: string | null;
  projectPath: string | null;
}

interface AgentMetaScopeOptions {
  provider?: ConfigProvider;
  projectId?: string | null;
  projectPath?: string | null;
  scope?: "all" | "global" | "project";
}

function normalizeProvider(value: unknown): ConfigProvider {
  if (value === "codex" || value === "gemini" || value === "claude") {
    return value;
  }
  return "claude";
}

function normalizeProjectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function scopeKey(projectPath: string | null): string {
  return projectPath ?? "";
}

function buildStorageKey(
  provider: ConfigProvider,
  name: string,
  projectPath: string | null,
): string {
  const encodedScope = Buffer.from(scopeKey(projectPath), "utf8").toString(
    "base64url",
  );
  return `${META_KEY_PREFIX}::${provider}::${encodedScope}::${name}`;
}

function parseStorageKey(value: string): {
  provider: ConfigProvider;
  projectPath: string | null;
  name: string;
} | null {
  const parts = value.split("::");
  if (parts.length < 4 || parts[0] !== META_KEY_PREFIX) return null;
  const provider = normalizeProvider(parts[1]);
  const encodedScope = parts[2] || "";
  let projectPath: string | null = null;
  try {
    const decoded = Buffer.from(encodedScope, "base64url").toString("utf8");
    projectPath = decoded || null;
  } catch {
    projectPath = null;
  }
  const name = parts.slice(3).join("::");
  if (!name) return null;
  return { provider, projectPath, name };
}

function findMetaRow(
  name: string,
  provider: ConfigProvider,
  projectPath: string | null,
): Record<string, unknown> | null {
  const db = getDb();
  const storageKey = buildStorageKey(provider, name, projectPath);
  const row = db
    .prepare("SELECT * FROM agent_catalog WHERE agent_name = ?")
    .get(storageKey) as Record<string, unknown> | undefined;
  if (row) return row;

  const legacyScoped = db
    .prepare(
      `SELECT * FROM agent_catalog
       WHERE agent_name = ?
         AND (provider = ? OR (? = 'claude' AND provider IS NULL))
         AND COALESCE(project_path, '') = ?`,
    )
    .get(
      name,
      provider,
      provider,
      scopeKey(projectPath),
    ) as Record<string, unknown> | undefined;
  if (legacyScoped) return legacyScoped;

  if (provider === "claude" && !projectPath) {
    const legacyGlobal = db
      .prepare("SELECT * FROM agent_catalog WHERE agent_name = ?")
      .get(name) as Record<string, unknown> | undefined;
    if (legacyGlobal) return legacyGlobal;
  }

  return null;
}

function resolveContext(
  name: string,
  opts?: AgentMetaScopeOptions,
  existingRow?: Record<string, unknown> | null,
): {
  provider: ConfigProvider;
  projectPath: string | null;
  projectId: string | null;
  hasProjectPathInput: boolean;
  hasProjectIdInput: boolean;
} {
  const hasProjectPathInput = opts?.projectPath !== undefined;
  const hasProjectIdInput = opts?.projectId !== undefined;
  const provider =
    opts?.provider !== undefined
      ? normalizeProvider(opts.provider)
      : normalizeProvider(existingRow?.provider);
  const projectPath = hasProjectPathInput
    ? normalizeProjectPath(opts?.projectPath)
    : normalizeProjectPath(existingRow?.project_path);
  const projectId = hasProjectIdInput
    ? (opts?.projectId ?? null)
    : (existingRow?.project_id as string | null | undefined) ?? null;

  // If no explicit context and no existing row, default to global claude-compatible namespace.
  if (!existingRow && opts?.provider === undefined) {
    return {
      provider: "claude",
      projectPath: hasProjectPathInput ? projectPath : null,
      projectId: hasProjectIdInput ? projectId : null,
      hasProjectPathInput,
      hasProjectIdInput,
    };
  }

  return {
    provider,
    projectPath,
    projectId,
    hasProjectPathInput,
    hasProjectIdInput,
  };
}

export function getAgentMeta(
  name: string,
  opts?: AgentMetaScopeOptions,
): AgentMeta | null {
  const provider = normalizeProvider(opts?.provider);
  const projectPath = normalizeProjectPath(opts?.projectPath);
  const row = findMetaRow(name, provider, projectPath);
  return row ? rowToMeta(row) : null;
}

export function getAllAgentMeta(
  opts?: AgentMetaScopeOptions,
): AgentMeta[] {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts?.provider) {
    const provider = normalizeProvider(opts.provider);
    if (provider === "claude") {
      where.push("(provider = ? OR provider IS NULL)");
      params.push(provider);
    } else {
      where.push("provider = ?");
      params.push(provider);
    }
  }

  if (opts?.scope === "global") {
    where.push("project_id IS NULL");
  }

  if (opts?.scope === "project" && opts.projectId) {
    where.push("project_id = ?");
    params.push(opts.projectId);
  }

  const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM agent_catalog${whereSql} ORDER BY agent_name`)
    .all(...params) as Record<string, unknown>[];
  return rows.map(rowToMeta);
}

export function upsertAgentMeta(
  name: string,
  meta: Partial<Omit<AgentMeta, "agentName">>,
  opts?: AgentMetaScopeOptions,
): void {
  const db = getDb();
  const providerHint = normalizeProvider(meta.provider ?? opts?.provider);
  const projectPathHint = normalizeProjectPath(
    meta.projectPath ?? opts?.projectPath,
  );
  const existingRow = findMetaRow(name, providerHint, projectPathHint);
  const context = resolveContext(
    name,
    {
      ...opts,
      provider: providerHint,
      projectPath: meta.projectPath ?? opts?.projectPath,
      projectId: meta.projectId ?? opts?.projectId,
    },
    existingRow,
  );
  const storageKey = buildStorageKey(context.provider, name, context.projectPath);

  if (existingRow) {
    const sets: string[] = [];
    const values: unknown[] = [];

    const existingStorageKey = String(existingRow.agent_name ?? "");
    if (existingStorageKey !== storageKey) {
      sets.push("agent_name = ?");
      values.push(storageKey);
    }

    const existingProvider = normalizeProvider(existingRow.provider);
    if (existingProvider !== context.provider) {
      sets.push("provider = ?");
      values.push(context.provider);
    }

    if (context.hasProjectIdInput) {
      sets.push("project_id = ?");
      values.push(context.projectId);
    }

    if (context.hasProjectPathInput) {
      sets.push("project_path = ?");
      values.push(context.projectPath);
    }

    if (meta.source !== undefined) {
      sets.push("source = ?");
      values.push(meta.source);
    }
    if (meta.enabled !== undefined) {
      sets.push("enabled = ?");
      values.push(meta.enabled ? 1 : 0);
    }
    if (meta.sourceUrl !== undefined) {
      sets.push("source_url = ?");
      values.push(meta.sourceUrl);
    }
    if (meta.sourceVersion !== undefined) {
      sets.push("source_version = ?");
      values.push(meta.sourceVersion);
    }
    if (meta.skills !== undefined) {
      sets.push("skills = ?");
      values.push(JSON.stringify(meta.skills));
    }
    if (sets.length > 0) {
      sets.push("updated_at = CURRENT_TIMESTAMP");
      values.push(existingStorageKey);
      db.prepare(
        `UPDATE agent_catalog SET ${sets.join(", ")} WHERE agent_name = ?`,
      ).run(...values);
    }
  } else {
    db.prepare(
      `INSERT INTO agent_catalog (
         agent_name,
         provider,
         source,
         enabled,
         source_url,
         source_version,
         installed_at,
         skills,
         project_id,
         project_path
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      storageKey,
      context.provider,
      meta.source ?? "custom",
      meta.enabled !== false ? 1 : 0,
      meta.sourceUrl ?? null,
      meta.sourceVersion ?? null,
      meta.installedAt ?? null,
      JSON.stringify(meta.skills ?? []),
      context.projectId,
      context.projectPath,
    );
  }
}

export function deleteAgentMeta(
  name: string,
  opts?: AgentMetaScopeOptions,
): boolean {
  const db = getDb();
  const provider = normalizeProvider(opts?.provider);
  const projectPath = normalizeProjectPath(opts?.projectPath);
  const existingRow = findMetaRow(name, provider, projectPath);
  const storageKey = existingRow
    ? String(existingRow.agent_name)
    : buildStorageKey(provider, name, projectPath);

  const result = db
    .prepare("DELETE FROM agent_catalog WHERE agent_name = ?")
    .run(storageKey);

  if (result.changes > 0) return true;
  if (storageKey !== name) {
    const legacyResult = db
      .prepare(
        `DELETE FROM agent_catalog
         WHERE agent_name = ?
           AND (provider = ? OR (? = 'claude' AND provider IS NULL))
           AND COALESCE(project_path, '') = ?`,
      )
      .run(name, provider, provider, scopeKey(projectPath));
    if (legacyResult.changes > 0) return true;
  }

  return result.changes > 0;
}

export function toggleEnabled(
  name: string,
  enabled: boolean,
  opts?: AgentMetaScopeOptions,
): void {
  upsertAgentMeta(
    name,
    { enabled, source: "custom", provider: normalizeProvider(opts?.provider) },
    opts,
  );
}

export function attachSkill(
  agentName: string,
  skillId: string,
  opts?: AgentMetaScopeOptions,
): void {
  const provider = normalizeProvider(opts?.provider);
  const projectPath = normalizeProjectPath(opts?.projectPath);
  const meta = getAgentMeta(agentName, { provider, projectPath });
  const skills = meta?.skills ?? [];
  if (!skills.includes(skillId)) {
    skills.push(skillId);
    upsertAgentMeta(
      agentName,
      { skills, provider },
      { provider, projectPath, projectId: opts?.projectId ?? null },
    );
  }
}

export function detachSkill(
  agentName: string,
  skillId: string,
  opts?: AgentMetaScopeOptions,
): void {
  const provider = normalizeProvider(opts?.provider);
  const projectPath = normalizeProjectPath(opts?.projectPath);
  const meta = getAgentMeta(agentName, { provider, projectPath });
  if (!meta) return;
  const skills = meta.skills.filter((s) => s !== skillId);
  upsertAgentMeta(
    agentName,
    { skills, provider },
    { provider, projectPath, projectId: opts?.projectId ?? null },
  );
}

export function getAgentSkills(
  agentName: string,
  opts?: AgentMetaScopeOptions,
): string[] {
  const provider = normalizeProvider(opts?.provider);
  const projectPath = normalizeProjectPath(opts?.projectPath);
  const meta = getAgentMeta(agentName, { provider, projectPath });
  return meta?.skills ?? [];
}

function rowToMeta(row: Record<string, unknown>): AgentMeta {
  const storedName = (row.agent_name as string) || "";
  const parsedKey = parseStorageKey(storedName);
  const provider = parsedKey?.provider ?? normalizeProvider(row.provider);
  const projectPath =
    normalizeProjectPath(row.project_path) ?? parsedKey?.projectPath ?? null;
  const agentName = parsedKey?.name || storedName;

  return {
    agentName,
    provider,
    source: (row.source as AgentMeta["source"]) || "custom",
    enabled: row.enabled !== 0,
    sourceUrl: (row.source_url as string) || null,
    sourceVersion: (row.source_version as string) || null,
    installedAt: (row.installed_at as number) ?? null,
    skills: (() => { try { return JSON.parse((row.skills as string) || "[]"); } catch { return []; } })(),
    updatedAt: (row.updated_at as string) || "",
    projectId: (row.project_id as string) || null,
    projectPath,
  };
}
