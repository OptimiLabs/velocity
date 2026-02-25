import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";
import { invalidateMarketplaceCache } from "@/app/api/marketplace/search/route";

const DEFAULT_SOURCE = {
  id: "default-github-search",
  name: "GitHub: Claude Code",
  source_type: "github_search",
  config: JSON.stringify({ query: "claude-code" }),
  enabled: 1,
};

function seedDefaultSource() {
  const db = getDb();
  const count = db
    .prepare("SELECT COUNT(*) as c FROM marketplace_sources")
    .get() as { c: number };
  if (count.c === 0) {
    db.prepare(
      "INSERT INTO marketplace_sources (id, name, source_type, config, enabled) VALUES (?, ?, ?, ?, ?)",
    ).run(
      DEFAULT_SOURCE.id,
      DEFAULT_SOURCE.name,
      DEFAULT_SOURCE.source_type,
      DEFAULT_SOURCE.config,
      DEFAULT_SOURCE.enabled,
    );
  }
}

export async function GET() {
  try {
    const db = getDb();
    seedDefaultSource();
    const rows = db
      .prepare("SELECT * FROM marketplace_sources ORDER BY created_at ASC")
      .all();
    const sources = (rows as Record<string, unknown>[]).map((r) => ({
      ...r,
      config: JSON.parse((r.config as string) || "{}"),
      enabled: Boolean(r.enabled),
    }));
    return NextResponse.json(sources);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch sources" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { name, source_type, config } = await request.json();
    if (!name || !source_type) {
      return NextResponse.json(
        { error: "name and source_type required" },
        { status: 400 },
      );
    }
    const db = getDb();
    const id = randomUUID();
    db.prepare(
      "INSERT INTO marketplace_sources (id, name, source_type, config) VALUES (?, ?, ?, ?)",
    ).run(id, name, source_type, JSON.stringify(config || {}));
    invalidateMarketplaceCache();

    const row = db
      .prepare("SELECT * FROM marketplace_sources WHERE id = ?")
      .get(id) as Record<string, unknown>;
    return NextResponse.json({
      ...row,
      config: JSON.parse((row.config as string) || "{}"),
      enabled: Boolean(row.enabled),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to add source" },
      { status: 500 },
    );
  }
}
