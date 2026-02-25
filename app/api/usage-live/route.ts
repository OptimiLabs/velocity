import { NextResponse } from "next/server";
import { fetchRealUsage } from "@/lib/claude/usage-fetcher";

export async function GET() {
  const data = await fetchRealUsage();
  return NextResponse.json(data);
}
