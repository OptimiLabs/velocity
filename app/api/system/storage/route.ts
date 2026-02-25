import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import {
  CLAUDE_DIR,
  PROJECTS_DIR,
  AGENTS_DIR,
  SKILLS_DIR,
} from "@/lib/claude-paths";

interface StorageBucket {
  label: string;
  path: string;
  fileCount: number;
  totalBytes: number;
  files: { name: string; bytes: number }[];
}

function scanDir(
  dirPath: string,
  label: string,
  extensions?: string[],
): StorageBucket {
  const bucket: StorageBucket = {
    label,
    path: dirPath,
    fileCount: 0,
    totalBytes: 0,
    files: [],
  };

  if (!fs.existsSync(dirPath)) return bucket;

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (extensions && !extensions.some((ext) => entry.name.endsWith(ext)))
          continue;
        try {
          const stat = fs.statSync(fullPath);
          const relName = path.relative(dirPath, fullPath);
          bucket.files.push({ name: relName, bytes: stat.size });
          bucket.totalBytes += stat.size;
          bucket.fileCount++;
        } catch {
          // skip inaccessible files
        }
      }
    }
  };

  walk(dirPath);
  // Sort largest first
  bucket.files.sort((a, b) => b.bytes - a.bytes);
  // Cap to top 20 files
  if (bucket.files.length > 20) {
    bucket.files = bucket.files.slice(0, 20);
  }
  return bucket;
}

function getDbSize(dbPath: string): number {
  try {
    // WAL + SHM files
    let total = 0;
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = dbPath + suffix;
      if (fs.existsSync(p)) {
        total += fs.statSync(p).size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

export async function GET() {
  const knowledgeDir = path.join(os.homedir(), ".claude", "knowledge");
  const projectMemoryDir = PROJECTS_DIR;

  const buckets: StorageBucket[] = [
    scanDir(knowledgeDir, "Knowledge", [".md", ".txt"]),
    scanDir(SKILLS_DIR, "Skills", [".md"]),
    scanDir(AGENTS_DIR, "Agents", [".yml", ".yaml", ".json", ".md"]),
    scanDir(projectMemoryDir, "Project Memory", [".md"]),
  ];

  // Instruction files: CLAUDE.md at known locations
  const instructionFiles: { name: string; bytes: number }[] = [];
  const claudeMdPaths = [
    path.join(os.homedir(), "CLAUDE.md"),
    path.join(os.homedir(), ".claude", "CLAUDE.md"),
  ];
  for (const p of claudeMdPaths) {
    try {
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        instructionFiles.push({
          name: p.replace(os.homedir(), "~"),
          bytes: stat.size,
        });
      }
    } catch {
      // skip
    }
  }
  // Also scan project-level CLAUDE.md files from projects dir
  if (fs.existsSync(PROJECTS_DIR)) {
    try {
      for (const entry of fs.readdirSync(PROJECTS_DIR, {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory()) continue;
        const claudeMd = path.join(PROJECTS_DIR, entry.name, "CLAUDE.md");
        try {
          if (fs.existsSync(claudeMd)) {
            const stat = fs.statSync(claudeMd);
            instructionFiles.push({
              name: `projects/${entry.name}/CLAUDE.md`,
              bytes: stat.size,
            });
          }
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
  }

  const instructionsBucket: StorageBucket = {
    label: "Instructions",
    path: "",
    fileCount: instructionFiles.length,
    totalBytes: instructionFiles.reduce((s, f) => s + f.bytes, 0),
    files: instructionFiles,
  };

  buckets.splice(1, 0, instructionsBucket); // after Knowledge

  // Database sizes
  const dashboardDb = path.join(CLAUDE_DIR, "dashboard.db");
  const consoleDb = path.join(process.cwd(), "claude-sessions.db");

  const databases = [
    { name: "Dashboard DB", bytes: getDbSize(dashboardDb) },
    { name: "Console Sessions DB", bytes: getDbSize(consoleDb) },
  ].filter((d) => d.bytes > 0);

  const dbTotalBytes = databases.reduce((s, d) => s + d.bytes, 0);

  const totalBytes =
    buckets.reduce((s, b) => s + b.totalBytes, 0) + dbTotalBytes;
  const totalFiles = buckets.reduce((s, b) => s + b.fileCount, 0);

  return NextResponse.json({
    buckets,
    databases,
    dbTotalBytes,
    totalBytes,
    totalFiles,
  });
}
