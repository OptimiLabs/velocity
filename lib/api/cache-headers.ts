import { NextResponse } from "next/server";

type CacheProfile = "list" | "detail" | "stats";

const PROFILES: Record<CacheProfile, string> = {
  list: "private, max-age=30, stale-while-revalidate=60", // sessions, projects, analytics
  detail: "private, max-age=10, stale-while-revalidate=30", // individual session/project
  stats: "private, max-age=60, stale-while-revalidate=120", // stats, summaries
};

export function jsonWithCache<T>(data: T, profile: CacheProfile): NextResponse {
  return NextResponse.json(data, {
    headers: { "Cache-Control": PROFILES[profile] },
  });
}
