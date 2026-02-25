import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { parseRouterEntries } from "@/lib/instructions/router-parser";
import {
  addRouterEntry,
  removeRouterEntry,
  updateRouterEntry,
} from "@/lib/instructions/router-writer";

function resolveClaudeMdPath(body: { claudeMdPath?: string }): string {
  return body.claudeMdPath || path.join(os.homedir(), ".claude", "CLAUDE.md");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;
    const claudeMdPath = resolveClaudeMdPath(body);

    if (!fs.existsSync(claudeMdPath)) {
      return NextResponse.json(
        { error: `${claudeMdPath} not found` },
        { status: 404 },
      );
    }

    if (action === "sync") {
      const content = fs.readFileSync(claudeMdPath, "utf-8");
      const entries = parseRouterEntries(content);
      return NextResponse.json({ entries, source: claudeMdPath });
    }

    if (action === "add-entry") {
      const { trigger, path: filePath, category, type } = body;
      if (!trigger || !filePath || !category) {
        return NextResponse.json(
          { error: "trigger, path, and category are required" },
          { status: 400 },
        );
      }

      const content = fs.readFileSync(claudeMdPath, "utf-8");
      const updated = addRouterEntry(content, {
        trigger,
        path: filePath,
        category,
        type: type || "knowledge",
      });
      fs.writeFileSync(claudeMdPath, updated, "utf-8");

      const entries = parseRouterEntries(updated);
      return NextResponse.json({ entries, source: claudeMdPath });
    }

    if (action === "update-entry") {
      const { path: filePath, trigger } = body;
      if (!filePath || !trigger) {
        return NextResponse.json(
          { error: "path and trigger are required" },
          { status: 400 },
        );
      }

      const content = fs.readFileSync(claudeMdPath, "utf-8");
      const updated = updateRouterEntry(content, filePath, trigger);
      fs.writeFileSync(claudeMdPath, updated, "utf-8");

      const entries = parseRouterEntries(updated);
      return NextResponse.json({ entries, source: claudeMdPath });
    }

    if (action === "remove-entry") {
      const { path: filePath } = body;
      if (!filePath) {
        return NextResponse.json(
          { error: "path is required" },
          { status: 400 },
        );
      }

      const content = fs.readFileSync(claudeMdPath, "utf-8");
      const updated = removeRouterEntry(content, filePath);
      fs.writeFileSync(claudeMdPath, updated, "utf-8");

      const entries = parseRouterEntries(updated);
      return NextResponse.json({ entries, source: claudeMdPath });
    }

    // --- Category CRUD ---

    if (action === "add-category") {
      const { name } = body;
      if (!name) {
        return NextResponse.json(
          { error: "name is required" },
          { status: 400 },
        );
      }

      const catName = name.toLowerCase().trim();
      const content = fs.readFileSync(claudeMdPath, "utf-8");

      // Check if category already exists
      const existingEntries = parseRouterEntries(content);
      if (existingEntries.some((e) => e.category === catName)) {
        return NextResponse.json(
          { error: "Category already exists" },
          { status: 409 },
        );
      }

      // Create directory for knowledge files
      const knowledgeDir = path.join(
        path.dirname(claudeMdPath),
        "knowledge",
        catName,
      );
      if (!fs.existsSync(knowledgeDir)) {
        fs.mkdirSync(knowledgeDir, { recursive: true });
      }

      // Append a new section to CLAUDE.md
      const capitalizedName =
        catName.charAt(0).toUpperCase() + catName.slice(1);
      const newSection = `\n\n### ${capitalizedName}\n| When working on... | Read |\n| ------------------ | ---- |`;
      const updated = content.trimEnd() + newSection + "\n";
      fs.writeFileSync(claudeMdPath, updated, "utf-8");

      const entries = parseRouterEntries(updated);
      return NextResponse.json({ entries, source: claudeMdPath });
    }

    if (action === "rename-category") {
      const { oldName, newName } = body;
      if (!oldName || !newName) {
        return NextResponse.json(
          { error: "oldName and newName are required" },
          { status: 400 },
        );
      }

      const content = fs.readFileSync(claudeMdPath, "utf-8");
      const lines = content.split("\n");
      const oldLower = oldName.toLowerCase();
      const newLower = newName.toLowerCase();
      const newCapitalized =
        newLower.charAt(0).toUpperCase() + newLower.slice(1);

      // Rename heading
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^(#{1,4})\s+(.+)$/);
        if (match && match[2].toLowerCase() === oldLower) {
          lines[i] = `${match[1]} ${newCapitalized}`;
        }
      }

      // Rename paths in table rows: knowledge/oldName/ → knowledge/newName/
      for (let i = 0; i < lines.length; i++) {
        if (
          lines[i].trim().startsWith("|") &&
          lines[i].includes(`knowledge/${oldLower}/`)
        ) {
          lines[i] = lines[i].replace(
            new RegExp(`knowledge/${oldLower}/`, "g"),
            `knowledge/${newLower}/`,
          );
        }
      }

      const updated = lines.join("\n");
      fs.writeFileSync(claudeMdPath, updated, "utf-8");

      // Rename directory if it exists
      const oldDir = path.join(
        path.dirname(claudeMdPath),
        "knowledge",
        oldLower,
      );
      const newDir = path.join(
        path.dirname(claudeMdPath),
        "knowledge",
        newLower,
      );
      if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        fs.renameSync(oldDir, newDir);
      }

      const entries = parseRouterEntries(updated);
      return NextResponse.json({ entries, source: claudeMdPath });
    }

    if (action === "delete-category") {
      const { name } = body;
      if (!name) {
        return NextResponse.json(
          { error: "name is required" },
          { status: 400 },
        );
      }

      const catLower = name.toLowerCase();
      const content = fs.readFileSync(claudeMdPath, "utf-8");
      const lines = content.split("\n");

      // Remove the category section (heading + table rows until next heading or blank gap)
      const filteredLines: string[] = [];
      let inSection = false;
      let inTable = false;

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);

        if (headingMatch && headingMatch[1].toLowerCase() === catLower) {
          inSection = true;
          inTable = false;
          continue;
        }

        if (inSection) {
          if (trimmed.startsWith("|")) {
            inTable = true;
            continue;
          }
          if (inTable && trimmed === "") {
            inSection = false;
            inTable = false;
            continue;
          }
          if (/^#{1,4}\s/.test(trimmed)) {
            inSection = false;
            inTable = false;
            filteredLines.push(lines[i]);
            continue;
          }
          if (inTable) continue;
          inSection = false;
        }

        filteredLines.push(lines[i]);
      }

      const updated = filteredLines.join("\n");
      fs.writeFileSync(claudeMdPath, updated, "utf-8");

      // Do NOT delete the directory — files become orphaned
      const entries = parseRouterEntries(updated);
      return NextResponse.json({ entries, source: claudeMdPath });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Router operation failed" },
      { status: 500 },
    );
  }
}
