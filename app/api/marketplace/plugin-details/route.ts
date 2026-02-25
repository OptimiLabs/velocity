import { NextRequest, NextResponse } from "next/server";
import {
  fetchRepoTreeWithBranch,
  resolveRepoComponents,
} from "@/lib/marketplace/discovery";
import type { PackageDetails } from "@/types/marketplace";

const DETAILS_CACHE_TTL_MS = 5 * 60 * 1000;
const DETAILS_CACHE_MAX_ENTRIES = 200;
const detailsCache = new Map<
  string,
  { expiresAt: number; details: PackageDetails }
>();

function makeCacheKey(
  owner: string,
  repo: string,
  branch?: string,
  sourcePath?: string | null,
): string {
  return `${owner}/${repo}@${branch || "__default"}:${sourcePath || ""}`;
}

function readCache(key: string): PackageDetails | null {
  const hit = detailsCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    detailsCache.delete(key);
    return null;
  }
  return hit.details;
}

function writeCache(key: string, details: PackageDetails) {
  detailsCache.set(key, { expiresAt: Date.now() + DETAILS_CACHE_TTL_MS, details });

  if (detailsCache.size <= DETAILS_CACHE_MAX_ENTRIES) return;
  for (const [entryKey, entry] of detailsCache.entries()) {
    if (entry.expiresAt <= Date.now()) {
      detailsCache.delete(entryKey);
    }
  }
  while (detailsCache.size > DETAILS_CACHE_MAX_ENTRIES) {
    const oldest = detailsCache.keys().next();
    if (oldest.done) break;
    detailsCache.delete(oldest.value);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const branch = searchParams.get("branch") || undefined;
  const sourcePath = searchParams.get("sourcePath");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo param" },
      { status: 400 },
    );
  }

  const cacheKey = makeCacheKey(owner, repo, branch, sourcePath);
  const cached = readCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const treeResult = await fetchRepoTreeWithBranch(owner, repo, branch);
  if (!treeResult) {
    return NextResponse.json(
      { error: "Failed to fetch repository tree" },
      { status: 502 },
    );
  }

  const { tree, branch: resolvedBranch } = treeResult;
  const { components, readme } = await resolveRepoComponents({
    owner,
    repo,
    branch: resolvedBranch,
    tree,
    sourcePath,
    includeDescriptions: true,
    includeReadmeFallback: true,
  });

  const kindOrder: Record<string, number> = {
    agent: 0,
    skill: 1,
    command: 2,
    "mcp-server": 3,
  };
  components.sort((a, b) => {
    const ka = kindOrder[a.kind] ?? 9;
    const kb = kindOrder[b.kind] ?? 9;
    if (ka !== kb) return ka - kb;
    return a.name.localeCompare(b.name);
  });

  const estimatedTokensTotal = components.reduce(
    (sum, component) => sum + (component.estimatedTokens || 0),
    0,
  );

  const details: PackageDetails = {
    repo: { owner, name: repo, defaultBranch: resolvedBranch },
    components,
    readme,
    estimatedTokensTotal,
  };

  writeCache(cacheKey, details);
  if (resolvedBranch && resolvedBranch !== branch) {
    writeCache(makeCacheKey(owner, repo, resolvedBranch, sourcePath), details);
  }

  return NextResponse.json(details);
}
