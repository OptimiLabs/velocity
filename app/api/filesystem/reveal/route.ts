import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

export async function POST(req: NextRequest) {
  try {
    const { path: filePath } = await req.json();

    if (!filePath || typeof filePath !== "string") {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    // Expand ~ to home directory
    const expanded = filePath.startsWith("~")
      ? filePath.replace(/^~/, os.homedir())
      : filePath;

    const absPath = path.resolve(expanded);

    // Security: only allow revealing files under .claude/
    if (!absPath.includes(`${path.sep}.claude${path.sep}`)) {
      return NextResponse.json(
        { error: "Only files within .claude/ can be revealed" },
        { status: 403 },
      );
    }

    if (!fs.existsSync(absPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const platform = process.platform;

    if (platform === "darwin") {
      execSync(`open -R "${absPath}"`);
    } else if (platform === "win32") {
      execSync(`explorer /select,"${absPath}"`);
    } else {
      // Linux: open the parent directory
      execSync(`xdg-open "${path.dirname(absPath)}"`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reveal file" },
      { status: 500 },
    );
  }
}
