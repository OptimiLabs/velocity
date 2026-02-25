import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { splitClaudeMd } from "@/lib/instructions/claudemd-splitter";
import { indexKnowledgeFile } from "@/lib/instructions/indexer";
import { addRouterEntry } from "@/lib/instructions/router-writer";
import {
  buildAISplitPlanPrompt,
  parseAISplitPlanResponse,
} from "@/lib/instructions/ai-split-planner";
import { callProvider, callProviderCLI } from "@/lib/instructions/ai-editor";
import { aiGenerate } from "@/lib/ai/generate";

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "analyze") {
      const { filePath } = body;
      if (!filePath) {
        return NextResponse.json(
          { error: "filePath is required" },
          { status: 400 },
        );
      }

      const resolved = expandHome(filePath);
      if (!fs.existsSync(resolved)) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      const content = fs.readFileSync(resolved, "utf-8");
      const result = splitClaudeMd(content, resolved);
      return NextResponse.json(result);
    }

    if (action === "execute") {
      const { sourceFilePath, sections, updateRouter } = body;

      if (
        !sourceFilePath ||
        !Array.isArray(sections) ||
        sections.length === 0
      ) {
        return NextResponse.json(
          { error: "sourceFilePath and sections are required" },
          { status: 400 },
        );
      }

      const resolvedSource = expandHome(sourceFilePath);
      const created: {
        filePath: string;
        category: string;
        filename: string;
      }[] = [];

      for (const section of sections) {
        const { content, category, filename } = section;

        // Sanitize category (allow AI-proposed categories beyond the defaults)
        const sanitizedCategory = category
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "") || "general";

        // Sanitize filename
        const sanitized = filename
          .replace(/[^a-zA-Z0-9_.-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase();

        const finalFilename = sanitized.endsWith(".md")
          ? sanitized
          : `${sanitized}.md`;

        const knowledgeDir = path.join(
          os.homedir(),
          ".claude",
          "knowledge",
          sanitizedCategory,
        );
        const filePath = path.join(knowledgeDir, finalFilename);

        fs.mkdirSync(knowledgeDir, { recursive: true });
        fs.writeFileSync(filePath, content, "utf-8");
        indexKnowledgeFile(filePath, category, finalFilename);

        created.push({ filePath, category: sanitizedCategory, filename: finalFilename });
      }

      // Update router table in source CLAUDE.md
      if (updateRouter && fs.existsSync(resolvedSource)) {
        let claudeContent = fs.readFileSync(resolvedSource, "utf-8");
        for (const file of created) {
          const heading =
            sections.find(
              (s: { filename: string }) =>
                s.filename.toLowerCase().replace(/[^a-z0-9.-]/g, "-") ===
                  file.filename.replace(/\.md$/, "") ||
                s.filename === file.filename,
            )?.heading ?? file.filename.replace(/\.md$/, "").replace(/-/g, " ");

          claudeContent = addRouterEntry(claudeContent, {
            trigger: heading.replace(/^#+\s*/, ""),
            path: `${file.category}/${file.filename}`,
            category: file.category,
            type: "knowledge",
          });
        }
        fs.writeFileSync(resolvedSource, claudeContent, "utf-8");
      }

      return NextResponse.json({ success: true, created });
    }

    if (action === "ai-split") {
      const { filePath, guidelines, structureMode, existingCategories, provider } = body;
      if (!filePath) {
        return NextResponse.json(
          { error: "filePath is required" },
          { status: 400 },
        );
      }

      const resolved = expandHome(filePath);
      if (!fs.existsSync(resolved)) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      const content = fs.readFileSync(resolved, "utf-8");
      const splitResult = splitClaudeMd(content, resolved);

      // Build prompt and call AI
      const knowledgeDir = path.join(os.homedir(), ".claude", "knowledge");
      const existingFiles: { category: string; filename: string }[] = [];
      if (fs.existsSync(knowledgeDir)) {
        const cats = fs.readdirSync(knowledgeDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name);
        for (const cat of cats) {
          const catDir = path.join(knowledgeDir, cat);
          const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".md"));
          for (const f of files) {
            existingFiles.push({ category: cat, filename: f });
          }
        }
      }

      const prompt = buildAISplitPlanPrompt(splitResult.sections, {
        guidelines,
        structureMode: structureMode || "ai-decide",
        existingCategories: existingCategories || existingFiles.map((f) => f.category).filter((v, i, a) => a.indexOf(v) === i),
        existingFiles,
      });

      let aiResponse: string;
      try {
        type SplitProvider =
          | "claude-cli"
          | "codex-cli"
          | "anthropic"
          | "openai"
          | "google"
          | "openrouter"
          | "local"
          | "custom";
        const providerName =
          typeof provider === "string" && provider.trim().length > 0
            ? (provider.trim() as SplitProvider)
            : undefined;
        if (!providerName) {
          aiResponse = await aiGenerate(prompt, { timeoutMs: 180_000 });
        } else if (providerName === "claude-cli") {
          aiResponse = (await callProviderCLI(prompt)).content;
        } else if (providerName === "codex-cli") {
          aiResponse = await aiGenerate(prompt, {
            provider: "codex-cli",
            timeoutMs: 180_000,
          });
        } else if (
          providerName === "anthropic" ||
          providerName === "openai" ||
          providerName === "google" ||
          providerName === "openrouter" ||
          providerName === "local" ||
          providerName === "custom"
        ) {
          aiResponse = (await callProvider(providerName, prompt)).content;
        } else {
          throw new Error("Invalid provider");
        }
      } catch {
        // If AI fails, fall back to keyword classification
        return NextResponse.json({
          ...splitResult,
          aiAssignments: splitResult.sections.map((s, i) => ({
            index: i,
            category: s.suggestedCategory,
            filename: s.suggestedFilename,
          })),
          aiFailed: true,
        });
      }

      const assignments = parseAISplitPlanResponse(aiResponse, splitResult.sections);

      return NextResponse.json({
        ...splitResult,
        aiAssignments: assignments,
      });
    }

    if (action === "get-structure") {
      const knowledgeDir = path.join(os.homedir(), ".claude", "knowledge");
      const categories: string[] = [];
      const files: { category: string; filename: string }[] = [];

      if (fs.existsSync(knowledgeDir)) {
        const entries = fs.readdirSync(knowledgeDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          categories.push(entry.name);
          const catDir = path.join(knowledgeDir, entry.name);
          const catFiles = fs.readdirSync(catDir).filter((f) => f.endsWith(".md"));
          for (const f of catFiles) {
            files.push({ category: entry.name, filename: f });
          }
        }
      }

      return NextResponse.json({ categories, files });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'analyze', 'execute', 'ai-split', or 'get-structure'" },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Split failed" },
      { status: 500 },
    );
  }
}
