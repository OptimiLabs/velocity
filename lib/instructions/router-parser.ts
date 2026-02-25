export interface RouterEntry {
  trigger: string;
  path: string;
  category: string;
  type: "knowledge" | "skill";
}

/**
 * Parse the "Knowledge Base" and "Skills" markdown tables from CLAUDE.md content.
 * Extracts trigger text and file paths / skill names from table rows.
 */
export function parseRouterEntries(claudeMdContent: string): RouterEntry[] {
  try {
    const entries: RouterEntry[] = [];

    // Match knowledge rows: | trigger text | ~/.claude/knowledge/path |
    const knowledgeRowRegex =
      /^\|\s*(.+?)\s*\|\s*`?~?\/?\.?claude\/knowledge\/(.+?)`?\s*\|/gm;

    for (const match of claudeMdContent.matchAll(knowledgeRowRegex)) {
      const trigger = match[1].trim();
      const rawPath = match[2].trim();

      // Skip header rows and separator rows
      if (
        trigger.startsWith("--") ||
        trigger.toLowerCase().startsWith("when working on")
      )
        continue;

      const slashIdx = rawPath.indexOf("/");
      const category = slashIdx > 0 ? rawPath.slice(0, slashIdx) : "other";

      entries.push({ trigger, path: rawPath, category, type: "knowledge" });
    }

    // Match skill rows: | trigger text | /skill-name | or | trigger text | `/skill-name` |
    const skillRowRegex = /^\|\s*(.+?)\s*\|\s*`?\/([a-zA-Z0-9_:-]+)`?\s*\|/gm;

    for (const match of claudeMdContent.matchAll(skillRowRegex)) {
      const trigger = match[1].trim();
      const skillName = match[2].trim();

      // Skip header/separator rows and knowledge matches (contain "claude/knowledge")
      if (
        trigger.startsWith("--") ||
        (trigger.toLowerCase().startsWith("when") &&
          trigger.toLowerCase().includes("use"))
      )
        continue;
      // Skip if this was already captured as a knowledge entry (path contains slashes like a/b.md)
      if (skillName.includes("/") && skillName.endsWith(".md")) continue;

      entries.push({
        trigger,
        path: skillName,
        category: "skills",
        type: "skill",
      });
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Extract the non-table "preamble" text from CLAUDE.md content.
 * This is everything that isn't part of a router table section.
 */
export function extractPreamble(claudeMdContent: string): string {
  const lines = claudeMdContent.split("\n");
  const preambleLines: string[] = [];
  let inTable = false;
  let inRouterSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect router section headings
    if (/^#{1,3}\s*(skills?|knowledge\s*base?|knowledge)/i.test(trimmed)) {
      inRouterSection = true;
      inTable = false;
      continue;
    }

    // If we're in a router section, skip table rows and separators
    if (inRouterSection) {
      if (trimmed.startsWith("|")) {
        inTable = true;
        continue;
      }
      // Empty line after table ends the table
      if (inTable && trimmed === "") {
        inTable = false;
        inRouterSection = false;
        continue;
      }
      // Non-empty non-table line — check if it's a sub-heading within knowledge
      if (/^#{1,4}\s/.test(trimmed)) {
        // Sub-heading within router section (e.g. ### Frontend) — skip it
        continue;
      }
      if (inTable) continue;
      // We've left the table section
      inRouterSection = false;
    }

    preambleLines.push(line);
  }

  // Trim trailing empty lines
  while (
    preambleLines.length > 0 &&
    preambleLines[preambleLines.length - 1].trim() === ""
  ) {
    preambleLines.pop();
  }

  return preambleLines.join("\n");
}
