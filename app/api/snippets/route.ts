import { NextResponse } from "next/server";
import { listPromptSnippets } from "@/lib/db/prompt-snippets";

export async function GET() {
  try {
    const snippets = listPromptSnippets();
    return NextResponse.json(snippets);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
