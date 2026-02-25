export function buildProviderFilter(
  searchParams: URLSearchParams,
  opts?: { tableAlias?: string; conjunction?: "WHERE" | "AND" },
): { sql: string; params: string[] } {
  const provider = searchParams.get("provider");
  if (!provider) return { sql: "", params: [] };
  const col = opts?.tableAlias ? `${opts.tableAlias}.provider` : "provider";
  const conj = opts?.conjunction ?? "AND";
  return {
    sql: `${conj} COALESCE(${col}, 'claude') = ?`,
    params: [provider],
  };
}
