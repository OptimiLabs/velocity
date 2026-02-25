import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export async function PUT(req: NextRequest) {
  try {
    const { path: filePath, content } = await req.json();

    if (!filePath || typeof content !== "string") {
      return NextResponse.json(
        { error: "path and content are required" },
        { status: 400 },
      );
    }

    // Expand ~ to home directory
    const expanded = filePath.startsWith("~")
      ? filePath.replace(/^~/, os.homedir())
      : filePath;

    const absPath = path.resolve(expanded);

    // Security: only allow writing .md files
    if (!absPath.endsWith(".md")) {
      return NextResponse.json(
        { error: "Only .md files can be written" },
        { status: 403 },
      );
    }

    // Ensure file exists before overwriting (don't create new files)
    if (!fs.existsSync(absPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    fs.writeFileSync(absPath, content, "utf-8");
    const stat = fs.statSync(absPath);

    return NextResponse.json({
      path: absPath,
      name: path.basename(absPath),
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to write file" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "path parameter required" }, { status: 400 });
  }

  // Expand ~ to home directory
  const expanded = filePath.startsWith("~")
    ? filePath.replace(/^~/, os.homedir())
    : filePath;

  const absPath = path.resolve(expanded);

  // Security: only allow reading .md files
  if (!absPath.endsWith(".md")) {
    return NextResponse.json({ error: "Only .md files can be read" }, { status: 403 });
  }

  try {
    const content = fs.readFileSync(absPath, "utf-8");
    const stat = fs.statSync(absPath);

    return NextResponse.json({
      path: absPath,
      name: path.basename(absPath),
      content,
      size: stat.size,
      modified: stat.mtime.toISOString(),
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 },
    );
  }
}
