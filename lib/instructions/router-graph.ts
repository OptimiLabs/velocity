import path from "path";
import type { Node, Edge } from "@xyflow/react";
import type { RouterEntry } from "./router-parser";
import type { InstructionFile } from "@/types/instructions";

const CATEGORY_COLORS: Record<string, string> = {
  frontend: "#3b82f6", // blue
  backend: "#22c55e", // green
  frameworks: "#7c3aed", // violet
  workflows: "#f97316", // orange
  tools: "#ec4899", // pink
  skills: "#f59e0b", // amber
};

export { CATEGORY_COLORS };

export function buildRouterGraph(
  entries: RouterEntry[],
  files: InstructionFile[],
  orphaned: InstructionFile[],
  options?: { hubLabel?: string; hubSubtitle?: string },
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Build file path set for existence checks (knowledge + commands)
  const filePathSet = new Set(
    files.map((f) => {
      const knowledgeMatch = f.filePath.match(/knowledge\/(.+)$/);
      if (knowledgeMatch) return knowledgeMatch[1];
      const commandMatch = f.filePath.match(/commands\/(.+)$/);
      if (commandMatch) return path.basename(f.filePath, ".md");
      return "";
    }),
  );

  // Group entries by category
  const byCategory = new Map<string, RouterEntry[]>();
  for (const entry of entries) {
    const list = byCategory.get(entry.category) || [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }

  // Also group orphaned files by category
  const orphanedByCategory = new Map<string, InstructionFile[]>();
  for (const file of orphaned) {
    const cat = file.category || "other";
    const list = orphanedByCategory.get(cat) || [];
    list.push(file);
    orphanedByCategory.set(cat, list);
  }

  // Merge all category keys
  const allCategories = new Set([
    ...byCategory.keys(),
    ...orphanedByCategory.keys(),
  ]);

  // Column positions
  const HUB_X = 0;
  const CAT_X = 350;
  const FILE_X = 700;

  // Calculate file positions per category
  let globalY = 0;
  const categoryData: {
    key: string;
    y: number;
    height: number;
    fileCount: number;
  }[] = [];

  for (const cat of allCategories) {
    const routedFiles = byCategory.get(cat) || [];
    const orphanFiles = orphanedByCategory.get(cat) || [];
    const totalFiles = routedFiles.length + orphanFiles.length;
    const startY = globalY;
    const height = totalFiles * 95;

    categoryData.push({ key: cat, y: startY, height, fileCount: totalFiles });

    // Add file nodes for routed entries
    let fileY = startY;
    for (const entry of routedFiles) {
      const exists = filePathSet.has(entry.path);
      const matchedFile = files.find(
        (f) =>
          f.filePath.endsWith(entry.path) ||
          (entry.type === "skill" &&
            path.basename(f.filePath, ".md") === entry.path),
      );
      const id = `file-${entry.path}`;
      nodes.push({
        id,
        type: "file",
        position: { x: FILE_X, y: fileY },
        data: {
          label: entry.path.split("/").pop() || entry.path,
          trigger: entry.trigger,
          status: exists ? "found" : "missing",
          path: entry.path,
          tokenCount: matchedFile?.tokenCount || 0,
          isActive: matchedFile?.isActive ?? true,
        },
      });

      edges.push({
        id: `edge-${cat}-${id}`,
        source: `cat-${cat}`,
        target: id,
        style: { stroke: CATEGORY_COLORS[cat] || "#888", strokeWidth: 1.5 },
        animated: false,
      });

      fileY += 95;
    }

    // Add file nodes for orphaned files
    for (const file of orphanFiles) {
      const relPath = `${file.category}/${file.slug}.md`;
      const id = `file-orphan-${file.id}`;
      nodes.push({
        id,
        type: "file",
        position: { x: FILE_X, y: fileY },
        data: {
          label: file.fileName,
          trigger: "Not in CLAUDE.md router",
          status: "orphaned",
          path: relPath,
          tokenCount: file.tokenCount,
          isActive: file.isActive,
        },
      });

      edges.push({
        id: `edge-${cat}-${id}`,
        source: `cat-${cat}`,
        target: id,
        style: {
          stroke: CATEGORY_COLORS[cat] || "#888",
          strokeWidth: 1,
          strokeDasharray: "4 4",
        },
        animated: false,
      });

      fileY += 95;
    }

    globalY = fileY + 60; // gap between groups
  }

  // Add category nodes (centered vertically within their group)
  for (const { key, y, height, fileCount } of categoryData) {
    const catY = y + height / 2 - 25;
    const catTokens = files
      .filter((f) => f.category === key)
      .reduce((sum, f) => sum + f.tokenCount, 0);

    nodes.push({
      id: `cat-${key}`,
      type: "category",
      position: { x: CAT_X, y: catY },
      data: {
        label: key,
        fileCount,
        totalTokens: catTokens,
        color: CATEGORY_COLORS[key] || "#888",
      },
    });

    edges.push({
      id: `edge-hub-${key}`,
      source: "hub",
      target: `cat-${key}`,
      style: { stroke: "#888", strokeWidth: 1.5, strokeDasharray: "6 3" },
      animated: true,
    });
  }

  // Hub node (centered vertically)
  const totalHeight = globalY > 0 ? globalY - 40 : 0;
  nodes.push({
    id: "hub",
    type: "hub",
    position: { x: HUB_X, y: totalHeight / 2 - 30 },
    data: {
      label: options?.hubLabel || "CLAUDE.md",
      subtitle: options?.hubSubtitle || "~/.claude/CLAUDE.md",
      totalEntries: entries.length,
    },
  });

  return { nodes, edges };
}
