import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { homedir } from "os";
import { resolve, dirname, basename } from "path";
import { isRootPath, getParentOrNull } from "@/lib/platform";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const rawPath = params.get("path") || "~";
  const showHidden = params.get("showHidden") === "true";

  // Expand ~ to home directory
  const expanded = rawPath.startsWith("~")
    ? rawPath.replace(/^~/, homedir())
    : rawPath;

  const absPath = resolve(expanded);
  const homeDir = homedir();

  try {
    const dirents = await readdir(absPath, { withFileTypes: true });

    const entries = dirents
      .filter((d) => d.isDirectory())
      .filter((d) => showHidden || !d.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({
        name: d.name,
        path: resolve(absPath, d.name),
      }));

    const parent = getParentOrNull(absPath);

    return NextResponse.json({
      path: absPath,
      parent,
      entries,
      homeDir,
    });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    const parent = getParentOrNull(absPath);

    // For ENOENT, try to resolve the closest existing parent
    // so the UI can show the directory that does exist
    if (code === "ENOENT") {
      // Walk up to find existing parent, return its listing with the error
      let tryPath = dirname(absPath);
      for (let i = 0; i < 20 && !isRootPath(tryPath); i++) {
        try {
          const dirents = await readdir(tryPath, { withFileTypes: true });
          const entries = dirents
            .filter((d) => d.isDirectory())
            .filter((d) => showHidden || !d.name.startsWith("."))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((d) => ({
              name: d.name,
              path: resolve(tryPath, d.name),
            }));

          // Filter entries by what user was trying to type
          const partial = basename(absPath).toLowerCase();
          const filtered = partial
            ? entries.filter((e) => e.name.toLowerCase().startsWith(partial))
            : entries;

          return NextResponse.json({
            path: tryPath,
            parent: getParentOrNull(tryPath),
            entries: filtered.length > 0 ? filtered : entries,
            error: `Directory not found: ${rawPath}`,
            homeDir,
          });
        } catch {
          tryPath = dirname(tryPath);
        }
      }
    }

    return NextResponse.json({
      path: absPath,
      parent,
      entries: [],
      error: code === "EACCES" ? "Permission denied" : `Cannot read directory`,
      homeDir,
    });
  }
}
