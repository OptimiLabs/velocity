import { NextRequest, NextResponse } from "next/server";
import {
  rebuildIndex,
  incrementalIndex,
  nukeAndRebuild,
} from "@/lib/parser/indexer";

export async function POST(request: NextRequest) {
  try {
    const mode = request.nextUrl.searchParams.get("mode");
    let result;
    if (mode === "nuke") {
      result = await nukeAndRebuild({ batchDelay: 100 });
    } else if (mode === "rebuild") {
      result = await rebuildIndex({ batchDelay: 50 });
    } else {
      result = await incrementalIndex();
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
