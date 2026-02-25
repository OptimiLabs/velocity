import { NextResponse } from "next/server";
import {
  listPromptFiles,
  writePromptFile,
  commitChanges,
} from "@/lib/claude-md";
import type { PromptFileFrontmatter } from "@/lib/claude-md";

export async function GET() {
  try {
    const files = listPromptFiles();
    return NextResponse.json(files);
  } catch {
    return NextResponse.json(
      { error: "Failed to list prompt files" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filename, content, frontmatter } = body as {
      filename: string;
      content: string;
      frontmatter: PromptFileFrontmatter;
    };

    if (!filename || !frontmatter?.name) {
      return NextResponse.json(
        { error: "filename and frontmatter.name are required" },
        { status: 400 },
      );
    }

    const safeName = filename.endsWith(".md") ? filename : `${filename}.md`;
    const file = writePromptFile(safeName, content || "", frontmatter);
    commitChanges(`Add prompt: ${frontmatter.name}`);

    return NextResponse.json(file, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create prompt file" },
      { status: 500 },
    );
  }
}
