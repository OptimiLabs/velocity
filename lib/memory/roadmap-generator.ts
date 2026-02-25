import fs from "fs";
import path from "path";
import { analyzeProject, type FileInfo } from "./file-analyzer";
import { aiGenerate } from "../ai/generate";
import { estimateTokens } from "./token-counter";
import { cleanupMemoryFiles } from "./cleanup";

export interface RoadmapResult {
  filePath: string;
  tokenCount: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function buildFileTree(files: FileInfo[]): string {
  return files
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .map((f) => `${f.relativePath}  (${f.lineCount} lines, ${f.language})`)
    .join("\n");
}

function buildDepGraph(graph: Map<string, string[]>, limit = 30): string {
  // Sort by number of connections (most-connected first)
  const entries = Array.from(graph.entries())
    .map(([file, deps]) => ({ file, deps, count: deps.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  if (entries.length === 0) return "No import dependencies found.";

  return entries.map((e) => `${e.file} → ${e.deps.join(", ")}`).join("\n");
}

export async function generateRoadmap(opts: {
  projectPath: string;
  taskDescription: string;
  roles: Array<{ name: string; description: string }>;
  model?: string;
}): Promise<RoadmapResult> {
  const { projectPath, taskDescription, roles } = opts;

  // Step 1: Analyze project structure
  const analysis = analyzeProject(projectPath);

  // Step 2: Build compact representations
  const fileTree = buildFileTree(analysis.files);
  const depGraph = buildDepGraph(analysis.graph);

  const roleList = roles
    .map((r) => `- **${r.name}**: ${r.description}`)
    .join("\n");

  // Step 3: Build prompts
  const systemPrompt = `You are a codebase analyst creating context roadmaps for multi-agent coding teams.

## Output format
- Use ### headers for each role
- Under each role, use bullet lists with file paths
- Mark files as READ (understand) or MODIFY (will change)
- Flag shared files where 2+ roles will write simultaneously with a warning marker
- Keep it concise — file paths and brief descriptions only. No code snippets.
- Output ONLY the markdown roadmap, nothing else.`;

  const userPrompt = `## Task
${taskDescription}

## Team Roles
${roleList}

## File Tree (with line counts)
${fileTree}

## Import Graph (key dependencies)
${depGraph}

Create a focused roadmap. For each role:
1. List the 5-15 most important files they should READ to understand the relevant code
2. Note which files they'll likely MODIFY
3. Highlight key types/interfaces they need to understand
4. Flag any shared files where multiple roles might conflict`;

  // Step 4: Generate roadmap via Claude
  const roadmapContent = await aiGenerate(userPrompt, { system: systemPrompt, cwd: projectPath, model: opts.model });

  // Step 5: Write to .claude/memory/
  const memoryDir = path.join(projectPath, ".claude", "memory");
  fs.mkdirSync(memoryDir, { recursive: true });

  const date = new Date().toISOString().split("T")[0];
  const slug = slugify(taskDescription);
  const filename = `${date}-${slug}.md`;
  const filePath = path.join(memoryDir, filename);

  fs.writeFileSync(filePath, roadmapContent, "utf-8");

  // Step 6: Clean up old files
  cleanupMemoryFiles(projectPath, filename);

  // Step 7: Return result
  const tokenCount = estimateTokens(roadmapContent);
  return { filePath, tokenCount };
}
