import { jsonWithCache } from "@/lib/api/cache-headers";
import { getDb, ensureIndexed } from "@/lib/db";
import fs from "fs";
import path from "path";
import os from "os";

function getDbSize(dbPath: string): number {
  let total = 0;
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = dbPath + suffix;
    try {
      if (fs.existsSync(p)) total += fs.statSync(p).size;
    } catch {
      // ignore unreadable files
    }
  }
  return total;
}

export async function GET(request: Request) {
  try {
    await ensureIndexed();
  } catch (error) {
    console.error(
      "[sessions/storage] ensureIndexed failed during GET; continuing with current DB state",
      error,
    );
  }
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  const projectId = searchParams.get("projectId");
  const compressionStateRaw = searchParams.get("compressionState");
  const compressionState =
    compressionStateRaw === "compressed" ||
    compressionStateRaw === "all" ||
    compressionStateRaw === "active"
      ? compressionStateRaw
      : "active";

  const db = getDb();
  const conditions: string[] = [];
  const params: string[] = [];

  if (provider) {
    conditions.push("COALESCE(provider, 'claude') = ?");
    params.push(provider);
  }
  if (projectId) {
    conditions.push("project_id = ?");
    params.push(projectId);
  }
  if (compressionState === "active") {
    conditions.push("compressed_at IS NULL");
  } else if (compressionState === "compressed") {
    conditions.push("compressed_at IS NOT NULL");
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(`SELECT id, jsonl_path FROM sessions ${whereClause}`)
    .all(...params) as Array<{ id: string; jsonl_path: string }>;

  let jsonlBytes = 0;
  let existingFiles = 0;
  let missingFiles = 0;

  for (const row of rows) {
    try {
      const stat = fs.statSync(row.jsonl_path);
      if (stat.isFile()) {
        jsonlBytes += stat.size;
        existingFiles++;
      } else {
        missingFiles++;
      }
    } catch {
      missingFiles++;
    }
  }

  const dashboardDbPath = path.join(os.homedir(), ".claude", "dashboard.db");
  const databaseBytes = getDbSize(dashboardDbPath);

  return jsonWithCache(
    {
      sessionCount: rows.length,
      sessionFileCount: existingFiles,
      missingFileCount: missingFiles,
      jsonlBytes,
      databaseBytes,
      totalBytes: jsonlBytes + databaseBytes,
    },
    "stats",
  );
}
