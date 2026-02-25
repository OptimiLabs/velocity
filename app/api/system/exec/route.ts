import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { isWindows, getDefaultShell } from "@/lib/platform";

export async function POST(request: Request) {
  try {
    const { command, timeout = 5000 } = await request.json();

    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "Command required" }, { status: 400 });
    }

    // Basic safety: block obviously destructive patterns
    const blocked = ["rm -rf /", "mkfs", "dd if=", ":(){", "fork bomb"];
    if (blocked.some((b) => command.includes(b))) {
      return NextResponse.json(
        { error: "Command blocked for safety" },
        { status: 403 },
      );
    }

    const shell = isWindows
      ? (() => {
          const gitBash = "C:\\Program Files\\Git\\bin\\sh.exe";
          if (existsSync(gitBash)) return gitBash;
          return undefined; // will use cmd.exe default
        })()
      : getDefaultShell();

    const stdout = execSync(command, {
      encoding: "utf-8",
      timeout: Math.min(timeout, 10000),
      cwd: process.cwd(),
      shell,
    });

    return NextResponse.json({ stdout: stdout.slice(0, 5000) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Execution failed";
    const stderr = (err as { stderr?: string })?.stderr || "";
    return NextResponse.json(
      { error: message, stderr: stderr.slice(0, 5000) },
      { status: 500 },
    );
  }
}
