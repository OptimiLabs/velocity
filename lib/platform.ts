import path from "path";
import { execFileSync } from "child_process";

export const isWindows = process.platform === "win32";
export const isMac = process.platform === "darwin";
export const isLinux = process.platform === "linux";

/** Cross-platform process kill (SIGKILL on Unix, taskkill /F on Windows) */
export function killProcess(pid: number): void {
  if (isWindows) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/F", "/T"], {
        stdio: "pipe",
      });
    } catch {
      /* already dead */
    }
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already dead */
    }
  }
}

/** Default shell for PTY sessions */
export function getDefaultShell(): string {
  if (isWindows) return process.env.COMSPEC || "cmd.exe";
  return process.env.SHELL || "/bin/bash";
}

/** Check if a path segment is a system/noise directory to filter out */
export function isSystemSegment(segment: string): boolean {
  // Unix system dirs
  if (["Users", "home", "tmp", "var", "opt", "usr"].includes(segment))
    return true;
  // Windows drive letters (C, D, C:, D:)
  if (/^[A-Za-z]:?$/.test(segment)) return true;
  return false;
}

/** Check if an absolute path is a filesystem root */
export function isRootPath(absPath: string): boolean {
  if (isWindows) return /^[A-Za-z]:\\?$/.test(absPath);
  return absPath === "/";
}

/** Get parent of a path, or null if already at root */
export function getParentOrNull(absPath: string): string | null {
  if (isRootPath(absPath)) return null;
  return path.dirname(absPath);
}
