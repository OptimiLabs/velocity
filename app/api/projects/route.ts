import { NextRequest } from "next/server";
import path from "path";
import { getDb, ensureIndexed } from "@/lib/db";
import { jsonWithCache } from "@/lib/api/cache-headers";
import { deriveProjectPath } from "@/lib/parser/indexer";

export async function GET(request: NextRequest) {
  await ensureIndexed();
  const db = getDb();

  const url = request.nextUrl;
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1),
    200,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") || "0", 10) || 0,
    0,
  );

  const { total } = db
    .prepare("SELECT COUNT(*) as total FROM projects")
    .get() as { total: number };
  const rows = db
    .prepare(
      "SELECT * FROM projects ORDER BY last_activity_at DESC LIMIT ? OFFSET ?",
    )
    .all(limit, offset) as Array<Record<string, unknown> & { path: string }>;
  const projects = rows.map((row) => {
    const dirName = path.basename(row.path);
    return {
      ...row,
      realPath: deriveProjectPath(dirName),
    };
  });

  return jsonWithCache({ projects, total, limit, offset }, "list");
}
