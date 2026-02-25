interface AnalyticsFilterResult {
  sql: string;
  params: string[];
}

/**
 * Builds SQL filter fragments from analytics query string parameters.
 * Supports multi-select (comma-separated) for role, model, and agentType.
 * Model dimension supports AND/OR via `modelOp` param (default: "or").
 */
export function buildAnalyticsFilters(
  searchParams: URLSearchParams,
  /** Table alias for the sessions table (e.g. "s") — needed when JOINing with other tables that share column names like project_id */
  tableAlias?: string,
): AnalyticsFilterResult {
  const parts: string[] = [];
  const params: string[] = [];
  const col = (name: string) => (tableAlias ? `${tableAlias}.${name}` : name);

  // Project — single value
  const projectId = searchParams.get("projectId");
  if (projectId) {
    parts.push(`AND ${col("project_id")} = ?`);
    params.push(projectId);
  }

  // Role — comma-separated, always OR
  const roleRaw = searchParams.get("role");
  if (roleRaw) {
    const roles = roleRaw.split(",").filter(Boolean);
    if (roles.length > 0) {
      const roleClauses: string[] = [];
      for (const r of roles) {
        if (r === "standalone") {
          roleClauses.push(
            `COALESCE(${col("session_role")}, 'standalone') != 'subagent'`,
          );
        } else if (r === "subagent") {
          roleClauses.push(`${col("session_role")} = 'subagent'`);
        }
      }
      if (roleClauses.length === 1) {
        parts.push(`AND ${roleClauses[0]}`);
      } else if (roleClauses.length > 1) {
        parts.push(`AND (${roleClauses.join(" OR ")})`);
      }
    }
  }

  // Model — comma-separated, AND/OR toggle
  const modelRaw = searchParams.get("model");
  if (modelRaw) {
    const models = modelRaw.split(",").filter(Boolean);
    const modelOp = searchParams.get("modelOp") === "and" ? "AND" : "OR";
    if (models.length === 1) {
      parts.push(`AND ${col("model_usage")} LIKE '%' || ? || '%'`);
      params.push(models[0]);
    } else if (models.length > 1) {
      const clauses = models.map(
        () => `${col("model_usage")} LIKE '%' || ? || '%'`,
      );
      parts.push(`AND (${clauses.join(` ${modelOp} `)})`);
      params.push(...models);
    }
  }

  // Agent type — comma-separated, always OR
  const agentTypeRaw = searchParams.get("agentType");
  if (agentTypeRaw) {
    const types = agentTypeRaw.split(",").filter(Boolean);
    if (types.length === 1) {
      parts.push(`AND ${col("subagent_type")} = ?`);
      params.push(types[0]);
    } else if (types.length > 1) {
      const placeholders = types.map(() => "?").join(", ");
      parts.push(`AND ${col("subagent_type")} IN (${placeholders})`);
      params.push(...types);
    }
  }

  // Billing plan — single value (e.g. "api", "pro")
  const billingPlan = searchParams.get("billingPlan");
  if (billingPlan) {
    parts.push(`AND ${col("billing_plan")} = ?`);
    params.push(billingPlan);
  }

  // Provider — single value (e.g. "claude", "codex")
  const provider = searchParams.get("provider");
  if (provider) {
    parts.push(`AND COALESCE(${col("provider")}, 'claude') = ?`);
    params.push(provider);
  }

  return { sql: parts.join(" "), params };
}

/**
 * Returns true if any dimension filter (project, role, model, agentType, billingPlan) is active.
 * Used by the main analytics route to apply dimension filters on the sessions table.
 */
export function hasActiveFilters(searchParams: URLSearchParams): boolean {
  return !!(
    searchParams.get("projectId") ||
    searchParams.get("role") ||
    searchParams.get("model") ||
    searchParams.get("agentType") ||
    searchParams.get("billingPlan") ||
    searchParams.get("provider")
  );
}
