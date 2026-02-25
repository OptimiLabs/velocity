import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { invalidateMarketplaceCache } from "@/app/api/marketplace/search/route";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { enabled } = await request.json();
    const db = getDb();
    db.prepare("UPDATE marketplace_sources SET enabled = ? WHERE id = ?").run(
      enabled ? 1 : 0,
      id,
    );
    invalidateMarketplaceCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update source" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = getDb();
    db.prepare("DELETE FROM marketplace_sources WHERE id = ?").run(id);
    invalidateMarketplaceCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete source" },
      { status: 500 },
    );
  }
}
