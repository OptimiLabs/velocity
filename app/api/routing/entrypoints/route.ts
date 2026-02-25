import { NextResponse } from "next/server";
import { getEntrypoints } from "@/lib/db/routing-graph";
import type { ConfigProvider } from "@/types/provider";

const VALID_PROVIDERS = new Set(["claude", "codex", "gemini"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const providerParam = url.searchParams.get("provider");
  const provider = providerParam && VALID_PROVIDERS.has(providerParam)
    ? (providerParam as ConfigProvider)
    : undefined;

  const entrypoints = getEntrypoints(provider);
  return NextResponse.json({ entrypoints });
}
