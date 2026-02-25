import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import {
  listInstructionFiles,
  getInstructionFile,
} from "@/lib/db/instruction-files";
import {
  fullScan,
  scanScope,
  addManualPath,
  indexKnowledgeFile,
  indexFile,
} from "@/lib/instructions/indexer";
import type { ScanScope } from "@/lib/instructions/indexer";
import { saveSkill } from "@/lib/skills";
import { getDb } from "@/lib/db";
import { addRouterEntry } from "@/lib/instructions/router-writer";
import { editWithAI } from "@/lib/instructions/ai-editor";
import { SKILL_CREATOR_GUIDE } from "@/lib/marketplace/recommended-items";
import type { InstructionFileType } from "@/types/instructions";
import type { ProviderTargetMode } from "@/types/provider-artifacts";
import { convertSkillTargets } from "@/lib/conversion/artifacts";
import matter from "gray-matter";

const VALID_CATEGORIES = [
  "frontend",
  "backend",
  "frameworks",
  "workflows",
  "tools",
];

function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return sanitized.endsWith(".md") ? sanitized : `${sanitized}.md`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;
    const fileType =
      (searchParams.get("fileType") as InstructionFileType) || undefined;
    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") || undefined;

    const files = listInstructionFiles({
      projectId,
      fileType,
      search,
      category,
    });
    return NextResponse.json(files);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch instruction files" },
      { status: 500 },
    );
  }
}

/** Try to add a skill entry to ~/.claude/CLAUDE.md Skills table */
function autoRouteSkill(skillName: string, trigger: string) {
  const claudeMdPath = path.join(os.homedir(), ".claude", "CLAUDE.md");
  if (!fs.existsSync(claudeMdPath)) return;
  const content = fs.readFileSync(claudeMdPath, "utf-8");
  const updated = addRouterEntry(content, {
    trigger,
    path: skillName,
    category: "skills",
    type: "skill",
  });
  fs.writeFileSync(claudeMdPath, updated, "utf-8");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "scan") {
      const scope = body.scope as ScanScope | undefined;
      const result = scope ? scanScope(scope) : fullScan();
      return NextResponse.json(result);
    }

    if (action === "add-path") {
      const { path } = body;
      if (!path) {
        return NextResponse.json(
          { error: "Path is required" },
          { status: 400 },
        );
      }
      const result = addManualPath(path);
      return NextResponse.json(result);
    }

    if (action === "create") {
      const { filename, category, content } = body;
      if (!filename || !category) {
        return NextResponse.json(
          { error: "filename and category are required" },
          { status: 400 },
        );
      }
      if (!VALID_CATEGORIES.includes(category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
          { status: 400 },
        );
      }
      const finalFilename = sanitizeFilename(filename);
      const knowledgeDir = path.join(os.homedir(), ".claude", "knowledge", category);
      const filePath = path.join(knowledgeDir, finalFilename);
      fs.mkdirSync(knowledgeDir, { recursive: true });
      fs.writeFileSync(filePath, content || `# ${filename}\n\n`, "utf-8");
      indexKnowledgeFile(filePath, category, finalFilename);
      return NextResponse.json({ success: true, filePath, filename: finalFilename });
    }

    if (action === "copy") {
      const { sourceId, filename } = body;
      if (!sourceId) {
        return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
      }
      const source = getInstructionFile(sourceId);
      if (!source) {
        return NextResponse.json({ error: "Source file not found" }, { status: 404 });
      }
      const sourceContent = fs.readFileSync(source.filePath, "utf-8");
      const slug = path.basename(source.filePath, ".md");
      const finalFilename = filename
        ? sanitizeFilename(filename)
        : `${slug}-copy.md`;
      const destDir = path.dirname(source.filePath);
      const destPath = path.join(destDir, finalFilename);
      fs.writeFileSync(destPath, sourceContent, "utf-8");
      const category = source.category || path.basename(destDir);
      indexKnowledgeFile(destPath, category, finalFilename);
      return NextResponse.json({ success: true, filePath: destPath, filename: finalFilename });
    }

    if (action === "create-global") {
      const { fileType, filename, content } = body as {
        fileType: InstructionFileType;
        filename: string;
        content?: string;
      };
      if (!fileType || !filename) {
        return NextResponse.json(
          { error: "fileType and filename are required" },
          { status: 400 },
        );
      }
      if (fileType === "knowledge.md") {
        return NextResponse.json(
          { error: "Use action 'create' with a category for knowledge files" },
          { status: 400 },
        );
      }

      const finalFilename = fileType === "CLAUDE.md" ? filename : sanitizeFilename(filename);
      let targetPath: string;
      switch (fileType) {
        case "CLAUDE.md":
          targetPath = path.join(os.homedir(), ".claude", finalFilename);
          break;
        case "agents.md":
          targetPath = path.join(os.homedir(), ".claude", "agents", finalFilename);
          break;
        case "skill.md":
          targetPath = path.join(os.homedir(), ".claude", "commands", finalFilename);
          break;
        default:
          targetPath = path.join(os.homedir(), ".claude", finalFilename);
          break;
      }

      if (fs.existsSync(targetPath)) {
        return NextResponse.json(
          { error: "File already exists at this path" },
          { status: 409 },
        );
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content || `# ${filename}\n\n`, "utf-8");
      indexFile(targetPath, null, null, fileType);

      // Auto-route skill in CLAUDE.md
      if (fileType === "skill.md") {
        const skillName = path.basename(finalFilename, ".md");
        autoRouteSkill(skillName, body.trigger || skillName.replace(/-/g, " "));
      }

      return NextResponse.json({ success: true, filePath: targetPath, filename: finalFilename });
    }

    if (action === "create-project-file") {
      const { projectId, projectPath, fileType, filename, content } = body;
      if (!projectId || !projectPath || !fileType || !filename) {
        return NextResponse.json(
          { error: "projectId, projectPath, fileType, and filename are required" },
          { status: 400 },
        );
      }

      const finalFilename = fileType === "CLAUDE.md" ? "CLAUDE.md" : sanitizeFilename(filename);

      let targetPath: string;
      switch (fileType) {
        case "CLAUDE.md":
          targetPath = path.join(projectPath, "CLAUDE.md");
          break;
        case "agents.md":
          targetPath = path.join(projectPath, "agents.md");
          break;
        case "skill.md":
          targetPath = path.join(projectPath, ".claude", "commands", finalFilename);
          break;
        case "knowledge.md":
          targetPath = path.join(projectPath, ".claude", "knowledge", finalFilename);
          break;
        default:
          targetPath = path.join(projectPath, ".claude", finalFilename);
          break;
      }

      if (fs.existsSync(targetPath)) {
        return NextResponse.json(
          { error: "File already exists at this path" },
          { status: 409 },
        );
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content || `# ${finalFilename}\n\n`, "utf-8");
      indexFile(targetPath, projectPath, projectId, fileType);

      return NextResponse.json({ success: true, filePath: targetPath, filename: finalFilename });
    }

    if (action === "scan-dir") {
      const { dirPath } = body;
      if (!dirPath) {
        return NextResponse.json({ error: "dirPath is required" }, { status: 400 });
      }
      const resolved = dirPath.startsWith("~")
        ? path.join(os.homedir(), dirPath.slice(1))
        : path.resolve(dirPath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return NextResponse.json({ error: "Directory not found" }, { status: 404 });
      }
      let added = 0;
      const scanDir = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            scanDir(path.join(dir, entry.name));
          } else if (entry.name.endsWith(".md")) {
            const filePath = path.join(dir, entry.name);
            if (indexFile(filePath, null, null)) {
              added++;
            }
          }
        }
      };
      scanDir(resolved);
      return NextResponse.json({ success: true, added, dirPath: resolved });
    }

    if (action === "generate-skill") {
      const {
        name,
        prompt,
        provider = "claude-cli",
        targetProvider: requestedTargetProvider,
        sourceContext,
        previousContent,
        category,
      } = body as {
        name: string;
        prompt: string;
        provider?:
          | "claude-cli"
          | "anthropic"
          | "openai"
          | "google"
          | "openrouter"
          | "local"
          | "custom";
        targetProvider?: ProviderTargetMode;
        sourceContext?: string;
        previousContent?: string;
        category?: string;
      };
      const allowedProviders = new Set([
        "claude-cli",
        "anthropic",
        "openai",
        "google",
        "openrouter",
        "local",
        "custom",
      ]);
      if (!allowedProviders.has(provider)) {
        return NextResponse.json(
          { error: "invalid provider" },
          { status: 400 },
        );
      }
      const targetProvider = (
        requestedTargetProvider === "claude" ||
        requestedTargetProvider === "codex" ||
        requestedTargetProvider === "gemini" ||
        requestedTargetProvider === "all"
          ? requestedTargetProvider
          : "claude"
      ) as ProviderTargetMode;
      if (!name?.trim() || !prompt?.trim())
        return NextResponse.json(
          { error: "name and prompt are required" },
          { status: 400 },
        );

      // Category-aware structural guidance
      const categoryGuidance = category === "domain-expertise"
        ? `\n\nThis is a Domain Expertise skill — it should contain comprehensive reference material:
- Use ## Rules sections with clear, unambiguous statements
- Include good/bad examples to distinguish correct from incorrect patterns
- Cover edge cases specific to the domain
- Organize as a reference guide, not step-by-step instructions`
        : category === "workflow-automation"
        ? `\n\nThis is a Workflow Automation skill — it should define a multi-step process:
- Use numbered ## Step sections with clear validation gates between phases
- Each step must define what success looks like before proceeding
- Include ## Error handling with recovery actions for common failures
- Add conditional branches for different scenarios`
        : category === "mcp-enhancement"
        ? `\n\nThis is an MCP Enhancement skill — it should orchestrate MCP server tools:
- Start with ## Available tools listing the specific MCP tools this skill coordinates
- Define the order of tool calls and data flow between them
- Include parameter mapping — which output feeds into which input
- Add safety checks — which actions need user confirmation before execution`
        : "";

      let fullPrompt = `<skill_creation_guide>
${SKILL_CREATOR_GUIDE}
</skill_creation_guide>

Generate a Claude Code skill called "${name}".
User's description: ${prompt}${categoryGuidance}`;

      if (sourceContext) {
        fullPrompt += `

<source_context>
The following is analysis content that the skill should be based on. Extract the key patterns, guidelines, and actionable instructions from this analysis:
${sourceContext}
</source_context>`;
      }

      if (previousContent) {
        fullPrompt += `

<previous_generation>
The user wants to iterate on this previous generation. Improve it based on the updated instructions above while keeping what worked well:
${previousContent}
</previous_generation>`;
      }

      fullPrompt += `

Return ONLY the markdown content for the skill — no code fences, no preamble.
The output must begin with YAML frontmatter containing:
- name: the skill name
- description: a trigger condition starting with "Use when..." (e.g. "Use when implementing API endpoints that require authentication")${category ? `\n- category: ${category}` : ""}

The body after frontmatter should be a complete, well-structured skill definition that Claude can follow as instructions.`;

      const result = await editWithAI({
        provider,
        prompt: fullPrompt,
        originalContent: "",
        instructionId: "generate-skill",
      });

      const baseResponse = {
        success: true,
        content: result.content,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
      };

      if (targetProvider === "claude") {
        return NextResponse.json(baseResponse);
      }

      let parsedContent = result.content;
      let parsedName = name;
      let parsedDescription: string | undefined;
      let parsedCategory = category;
      try {
        const parsed = matter(result.content);
        parsedContent = parsed.content.trim();
        parsedName = String(parsed.data.name || name);
        parsedDescription = parsed.data.description
          ? String(parsed.data.description)
          : undefined;
        parsedCategory = parsed.data.category
          ? String(parsed.data.category)
          : category;
      } catch {
        // keep raw content if frontmatter parsing fails
      }

      const results = convertSkillTargets(
        {
          name: parsedName,
          description: parsedDescription,
          content: parsedContent,
          category: parsedCategory,
          visibility: "global",
        },
        targetProvider,
      );

      return NextResponse.json({
        ...baseResponse,
        targetProvider,
        primary: results.find((r) => r.target === "claude") ?? results[0] ?? null,
        results,
      });
    }

    if (action === "convert-to-skill") {
      const { id } = body;
      if (!id)
        return NextResponse.json({ error: "id is required" }, { status: 400 });

      const file = getInstructionFile(id);
      if (!file)
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      if (file.fileType !== "knowledge.md")
        return NextResponse.json(
          { error: "Only knowledge files can be converted" },
          { status: 400 },
        );

      // Read content from disk
      const content = fs.readFileSync(file.filePath, "utf-8");
      const name = path.basename(file.filePath, ".md");
      const description = file.title || name.replace(/-/g, " ");

      // Write as skill using existing saveSkill()
      saveSkill(name, description, content);

      // Auto-add routing entry in CLAUDE.md Skills table
      const trigger = description || name.replace(/-/g, " ");
      autoRouteSkill(name, trigger);

      // Remove source knowledge file
      fs.unlinkSync(file.filePath);

      // Remove DB row
      getDb().prepare("DELETE FROM instruction_files WHERE id = ?").run(id);

      return NextResponse.json({ success: true, skillName: name });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
