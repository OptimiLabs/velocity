"use client";

export function Loading() {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

export function RowCount({
  count,
  noun,
  loading,
}: {
  count?: number;
  noun: string;
  loading?: boolean;
}) {
  if (loading || count == null) {
    return <div className="text-xs text-muted-foreground">Loading...</div>;
  }
  return (
    <div className="text-xs text-muted-foreground tabular-nums">
      {count.toLocaleString()} {noun}
      {count !== 1 ? "s" : ""}
    </div>
  );
}
