import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { getInstructionFile } from "@/lib/db/instruction-files";
import { composeWithAI } from "@/lib/instructions/ai-editor";
import { indexFile } from "@/lib/instructions/indexer";
import type { ComposeRequest } from "@/types/instructions";

function resolvePath(inputPath: string): string {
  if (inputPath.startsWith("~")) {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return path.resolve(inputPath);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ComposeRequest;
    const { sourceIds, prompt, mode, provider, outputPath, outputFileName } =
      body;

    if (!sourceIds || sourceIds.length === 0) {
      return NextResponse.json(
        { error: "No source files selected" },
        { status: 400 },
      );
    }
    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 },
      );
    }
    if (!outputPath?.trim()) {
      return NextResponse.json(
        { error: "Output path is required" },
        { status: 400 },
      );
    }

    // Fetch all source files
    const sources: { name: string; path: string; content: string }[] = [];
    for (const id of sourceIds) {
      const file = getInstructionFile(id);
      if (!file) {
        return NextResponse.json(
          { error: `Source file not found: ${id}` },
          { status: 404 },
        );
      }
      sources.push({
        name: file.fileName,
        path: file.filePath,
        content: file.content,
      });
    }

    // Call AI to compose
    const result = await composeWithAI(
      sources,
      prompt,
      mode || "compose",
      provider || "claude-cli",
    );

    // Resolve output file path
    const resolvedDir = resolvePath(outputPath);
    const fileName = outputFileName?.trim() || "CLAUDE.md";
    const fullPath = path.join(resolvedDir, fileName);

    // Ensure directory exists
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }

    // Write the file
    fs.writeFileSync(fullPath, result.content, "utf-8");

    // Auto-index the new file
    indexFile(fullPath, resolvedDir, null);

    return NextResponse.json({
      content: result.content,
      filePath: fullPath,
      tokensUsed: result.tokensUsed,
      cost: result.cost,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compose failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
