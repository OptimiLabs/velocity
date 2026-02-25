import fs from "fs";
import path from "path";
import { estimateTokens } from "./token-counter";
import type { FileDep } from "@/types/memory";

export interface FileInfo {
  relativePath: string;
  language: string;
  lineCount: number;
  estimatedTokens: number;
}

export interface AnalysisResult {
  files: FileInfo[];
  deps: Omit<FileDep, "id" | "plan_id">[];
  graph: Map<string, string[]>;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".turbo",
  ".claude-swarm-worktrees",
  ".vercel",
  "coverage",
]);

const LANG_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".json": "json",
  ".css": "css",
  ".md": "markdown",
  ".sql": "sql",
};

const IMPORT_PATTERNS = [
  /import\s+.*?\s+from\s+['"](.+?)['"]/g,
  /import\s+['"](.+?)['"]/g,
  /require\s*\(\s*['"](.+?)['"]\s*\)/g,
  /import\s+type\s+.*?\s+from\s+['"](.+?)['"]/g,
];

function walkDir(dir: string, base: string, files: FileInfo[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        walkDir(fullPath, base, files);
      }
      continue;
    }

    const ext = path.extname(entry.name);
    const language = LANG_MAP[ext];
    if (!language) continue;

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const relativePath = path.relative(base, fullPath);
      files.push({
        relativePath,
        language,
        lineCount: content.split("\n").length,
        estimatedTokens: estimateTokens(content),
      });
    } catch {
      // Skip unreadable files
    }
  }
}

function resolveImportPath(
  importPath: string,
  sourceFile: string,
  projectRoot: string,
  existingFiles: Set<string>,
): string | null {
  // Handle @/ alias
  let resolved: string;
  if (importPath.startsWith("@/")) {
    resolved = importPath.slice(2);
  } else if (importPath.startsWith(".")) {
    const sourceDir = path.dirname(sourceFile);
    resolved = path.join(sourceDir, importPath);
  } else {
    // External package — skip
    return null;
  }

  // Normalize path separators
  resolved = resolved.replace(/\\/g, "/");

  // Try various extensions and index files
  const candidates = [
    resolved,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${resolved}/index.ts`,
    `${resolved}/index.tsx`,
    `${resolved}/index.js`,
  ];

  for (const candidate of candidates) {
    if (existingFiles.has(candidate)) return candidate;
  }

  return null;
}

export function analyzeProject(projectRoot: string): AnalysisResult {
  const files: FileInfo[] = [];
  walkDir(projectRoot, projectRoot, files);

  const existingFiles = new Set(files.map((f) => f.relativePath));
  const deps: Omit<FileDep, "id" | "plan_id">[] = [];
  const graph = new Map<string, string[]>();

  for (const file of files) {
    if (file.language !== "typescript" && file.language !== "javascript")
      continue;

    const fullPath = path.join(projectRoot, file.relativePath);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    const fileDeps: string[] = [];

    for (const pattern of IMPORT_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        const resolved = resolveImportPath(
          importPath,
          file.relativePath,
          projectRoot,
          existingFiles,
        );
        if (resolved && resolved !== file.relativePath) {
          // Determine dep type
          const isType = match[0].includes("import type");
          const isRequire = match[0].includes("require");
          const depType = isType
            ? ("type_reference" as const)
            : isRequire
              ? ("require" as const)
              : ("import" as const);

          // Extract symbol names from the import statement
          const symbolMatch = match[0].match(/\{\s*([^}]+)\s*\}/);
          const symbolNames = symbolMatch
            ? symbolMatch[1]
                .split(",")
                .map((s) => s.trim().split(" as ")[0].trim())
                .filter(Boolean)
            : [];

          deps.push({
            source_file: file.relativePath,
            target_file: resolved,
            dep_type: depType,
            symbol_names: JSON.stringify(symbolNames),
          });

          if (!fileDeps.includes(resolved)) {
            fileDeps.push(resolved);
          }
        }
      }
    }

    if (fileDeps.length > 0) {
      graph.set(file.relativePath, fileDeps);
    }
  }

  return { files, deps, graph };
}
