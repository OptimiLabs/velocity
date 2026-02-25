import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import {
  readFullGraph,
  readScopedGraph,
  updateNodePosition,
  deleteNode,
} from "@/lib/db/routing-graph";
import type { ConfigProvider } from "@/types/provider";

const VALID_PROVIDERS = new Set(["claude", "codex", "gemini"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const entrypoint = url.searchParams.get("entrypoint");
  const providerParam = url.searchParams.get("provider");
  const provider = providerParam && VALID_PROVIDERS.has(providerParam)
    ? (providerParam as ConfigProvider)
    : undefined;

  if (entrypoint && entrypoint !== "all") {
    const scoped = readScopedGraph(entrypoint, provider);
    const graph = scoped.nodes.length > 0 ? scoped : null;
    return NextResponse.json({ graph });
  }

  const full = readFullGraph(provider);
  const graph = full.nodes.length > 0 ? full : null;
  return NextResponse.json({ graph });
}

// PATCH: update node positions
export async function PATCH(req: Request) {
  const body = await req.json();
  const { nodeId, x, y } = body;

  if (!nodeId || typeof x !== "number" || typeof y !== "number") {
    return NextResponse.json(
      { error: "nodeId, x, y required" },
      { status: 400 },
    );
  }

  updateNodePosition(nodeId, x, y);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const { nodeId, deleteFile } = body;

  if (!nodeId || typeof nodeId !== "string") {
    return NextResponse.json({ error: "nodeId required" }, { status: 400 });
  }

  // Delete file from disk if requested (only .md files within home dir allowed)
  if (deleteFile && nodeId.endsWith(".md")) {
    const resolved = path.resolve(nodeId);
    const allowedRoot = path.resolve(os.homedir());
    if (!resolved.startsWith(allowedRoot + path.sep) && resolved !== allowedRoot) {
      return NextResponse.json(
        { error: "Invalid path: outside allowed directory" },
        { status: 400 },
      );
    }
    if (fs.existsSync(resolved)) {
      try {
        fs.unlinkSync(resolved);
      } catch (err) {
        return NextResponse.json(
          { error: `Failed to delete file: ${(err as Error).message}` },
          { status: 500 },
        );
      }
    }
  }

  deleteNode(nodeId);

  return NextResponse.json({ ok: true });
}
