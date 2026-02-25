import type { RouterEntry } from "./router-parser";

const SKILL_ROW_REGEX = /^\|\s*.+?\s*\|\s*`?\/([a-zA-Z0-9_:-]+)`?\s*\|/;

function extractSkillPathFromRow(line: string): string | null {
  const match = line.match(SKILL_ROW_REGEX);
  return match?.[1] ?? null;
}

/**
 * Inserts a new row into the matching section table in CLAUDE.md content.
 * Returns the updated content string.
 */
export function addRouterEntry(
  claudeMdContent: string,
  entry: RouterEntry,
): string {
  const lines = claudeMdContent.split("\n");

  if (entry.type === "skill") {
    const newRow = `| ${entry.trigger} | \`/${entry.path}\` |`;

    // No-op if this exact path already exists.
    if (lines.some((line) => extractSkillPathFromRow(line) === entry.path)) {
      return claudeMdContent;
    }

    // Find the skills table section
    let lastSkillRowIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (
        SKILL_ROW_REGEX.test(lines[i]) &&
        !lines[i].includes("claude/knowledge")
      ) {
        lastSkillRowIdx = i;
      }
    }

    if (lastSkillRowIdx >= 0) {
      lines.splice(lastSkillRowIdx + 1, 0, newRow);
      return lines.join("\n");
    }

    // Look for ## Skills heading and insert after table header
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,3}\s*skills?\b/i.test(lines[i].trim())) {
        // Find the separator row (|---|---|)
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (/^\|[\s-]+\|[\s-]+\|/.test(lines[j])) {
            lines.splice(j + 1, 0, newRow);
            return lines.join("\n");
          }
        }
      }
    }

    // Fallback: append at end
    return claudeMdContent.trimEnd() + "\n" + newRow + "\n";
  }

  // Knowledge entry (existing behavior)
  const newRow = `| ${entry.trigger} | \`~/.claude/knowledge/${entry.path}\` |`;
  const catPathPrefix = `knowledge/${entry.category}/`;

  let lastRowIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(catPathPrefix) && lines[i].trim().startsWith("|")) {
      lastRowIdx = i;
    }
  }

  if (lastRowIdx >= 0) {
    lines.splice(lastRowIdx + 1, 0, newRow);
    return lines.join("\n");
  }

  return claudeMdContent.trimEnd() + "\n" + newRow + "\n";
}

/**
 * Updates the trigger text for the row matching the given path in CLAUDE.md content.
 * Returns the updated content string.
 */
export function updateRouterEntry(
  claudeMdContent: string,
  pathToMatch: string,
  newTrigger: string,
): string {
  const lines = claudeMdContent.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) continue;
    if (extractSkillPathFromRow(line) !== pathToMatch) continue;

    // Extract the path portion (everything after the trigger column)
    const parts = line.split("|").filter((p) => p.trim());
    if (parts.length >= 2) {
      const pathPart = parts[1].trim();
      lines[i] = `| ${newTrigger} | ${pathPart} |`;
    }
  }
  return lines.join("\n");
}

/**
 * Removes the row matching the given path from CLAUDE.md content.
 * Returns the updated content string.
 */
export function removeRouterEntry(
  claudeMdContent: string,
  pathToRemove: string,
): string {
  const lines = claudeMdContent.split("\n");
  const filtered = lines.filter((line) => {
    if (!line.trim().startsWith("|")) return true;
    return extractSkillPathFromRow(line) !== pathToRemove;
  });
  return filtered.join("\n");
}

/**
 * Generate full CLAUDE.md content from structured preamble + entries.
 */
export function generateRouterContent(
  preamble: string,
  entries: RouterEntry[],
): string {
  const skillEntries = entries.filter((e) => e.type === "skill");
  const knowledgeEntries = entries.filter((e) => e.type === "knowledge");

  const parts: string[] = [];

  // Preamble
  if (preamble.trim()) {
    parts.push(preamble.trim());
  }

  // Skills section
  if (skillEntries.length > 0) {
    parts.push("## Skills");
    parts.push("");
    parts.push("| When... | Use |");
    parts.push("| ------- | --- |");
    for (const entry of skillEntries) {
      parts.push(`| ${entry.trigger} | \`/${entry.path}\` |`);
    }
  }

  // Knowledge section
  if (knowledgeEntries.length > 0) {
    // Group by category
    const byCategory = new Map<string, RouterEntry[]>();
    for (const entry of knowledgeEntries) {
      const cat = entry.category;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(entry);
    }

    parts.push("## Knowledge Base");

    for (const [category, catEntries] of byCategory) {
      parts.push("");
      parts.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}`);
      parts.push("| When working on... | Read |");
      parts.push("| ------------------ | ---- |");
      for (const entry of catEntries) {
        parts.push(
          `| ${entry.trigger} | \`~/.claude/knowledge/${entry.path}\` |`,
        );
      }
    }
  }

  return parts.join("\n") + "\n";
}
