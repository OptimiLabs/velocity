export type SortState = { column: string; dir: "asc" | "desc" } | null;

export function sortRows<T>(
  rows: T[],
  sort: SortState,
  accessor: (row: T, column: string) => number | string,
): T[] {
  if (!sort) return rows;
  const { column, dir } = sort;
  return [...rows].sort((a, b) => {
    const va = accessor(a, column);
    const vb = accessor(b, column);
    if (typeof va === "number" && typeof vb === "number") {
      return dir === "asc" ? va - vb : vb - va;
    }
    const sa = String(va);
    const sb = String(vb);
    return dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });
}

export function nextSort(current: SortState, column: string): SortState {
  if (!current || current.column !== column) return { column, dir: "asc" };
  if (current.dir === "asc") return { column, dir: "desc" };
  return null;
}
