import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

const VALID_CATEGORIES = [
  "frontend",
  "backend",
  "frameworks",
  "workflows",
  "tools",
];

export async function POST(request: Request) {
  try {
    const { content, category, filename, sourceUrl } = await request.json();

    if (!content || !category || !filename) {
      return NextResponse.json(
        { error: "content, category, and filename are required" },
        { status: 400 },
      );
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        {
          error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Sanitize filename
    const sanitized = filename
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();

    const finalFilename = sanitized.endsWith(".md")
      ? sanitized
      : `${sanitized}.md`;

    const knowledgeDir = path.join(
      os.homedir(),
      ".claude",
      "knowledge",
      category,
    );
    const filePath = path.join(knowledgeDir, finalFilename);

    // Prepare content with source URL comment header
    let fileContent = content;
    if (sourceUrl) {
      fileContent = `<!-- Source: ${sourceUrl} -->\n<!-- Imported: ${new Date().toISOString()} -->\n\n${content}`;
    }

    // Ensure directory exists and write file
    fs.mkdirSync(knowledgeDir, { recursive: true });
    fs.writeFileSync(filePath, fileContent, "utf-8");

    // Index the file immediately
    const { indexKnowledgeFile } = await import("@/lib/instructions/indexer");
    indexKnowledgeFile(filePath, category, finalFilename);

    return NextResponse.json({
      success: true,
      filePath,
      category,
      filename: finalFilename,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 },
    );
  }
}
