import path from "path";

export interface ParsedReference {
  referencedPath: string;
  context: string;
  referenceType:
    | "path"
    | "tilde-path"
    | "relative-path"
    | "inline-mention"
    | "table-entry";
}

export interface ParseResult {
  references: ParsedReference[];
}

/**
 * Regex-based parser — extracts all .md file references from a markdown file.
 * No AI needed. Fast, deterministic, zero API calls.
 */
export function parseFileReferences(
  fileContent: string,
  filePath: string,
): ParseResult {
  const references: ParsedReference[] = [];
  const seen = new Set<string>();

  const selfName = path.basename(filePath);

  function add(
    refPath: string,
    context: string,
    type: ParsedReference["referenceType"],
  ) {
    // Skip self-references
    if (refPath === filePath || path.basename(refPath) === selfName) return;
    // Skip URLs
    if (refPath.startsWith("http://") || refPath.startsWith("https://")) return;
    // Skip empty
    if (!refPath.trim()) return;
    // Dedupe
    const key = refPath;
    if (seen.has(key)) return;
    seen.add(key);

    references.push({ referencedPath: refPath, context, referenceType: type });
  }

  const lines = fileContent.split("\n");

  for (const line of lines) {
    // 1. Backtick paths: `~/.claude/figma-access.md` or `./rules.md`
    const backtickMatches = line.matchAll(/`([^`]*\.md)`/g);
    for (const m of backtickMatches) {
      const p = m[1];
      const type = p.startsWith("~/")
        ? "tilde-path"
        : p.startsWith("/")
          ? "path"
          : "relative-path";
      add(p, extractContext(line, p), type);
    }

    // 2. Markdown links: [text](path.md) or [text](./path.md)
    const linkMatches = line.matchAll(/\[([^\]]*)\]\(([^)]*\.md)\)/g);
    for (const m of linkMatches) {
      const linkText = m[1];
      const p = m[2];
      if (p.startsWith("http")) continue;
      const type = p.startsWith("~/")
        ? "tilde-path"
        : p.startsWith("/")
          ? "path"
          : "relative-path";
      add(p, linkText || extractContext(line, p), type);
    }

    // 3. Bare paths ending in .md (not in backticks or links)
    // Match paths like ~/.claude/foo.md, ./bar.md, /abs/path.md, .claude/thing.md
    const bareMatches = line.matchAll(
      /(?:^|[\s"'(,|])([~.]?[/\w._-]+\.md)(?=[\s"'),|:;]|$)/g,
    );
    for (const m of bareMatches) {
      const p = m[1];
      if (p.startsWith("http")) continue;
      const type = p.startsWith("~/")
        ? "tilde-path"
        : p.startsWith("/")
          ? "path"
          : "relative-path";
      add(p, extractContext(line, p), type);
    }

    // 4. "Contents of" / "See" / "documented in" patterns
    const seeMatch = line.match(
      /(?:See|see|refer to|documented in|Check|check)\s+[`"']?([~./][\w/._-]+\.md)/,
    );
    if (seeMatch) {
      const p = seeMatch[1];
      const type = p.startsWith("~/")
        ? "tilde-path"
        : p.startsWith("/")
          ? "path"
          : "relative-path";
      add(p, extractContext(line, p), type);
    }

    // 5. Table entries with .md paths: | ... path.md ... |
    if (line.includes("|") && line.match(/\.md/)) {
      const tableCells = line.split("|").map((c) => c.trim());
      for (const cell of tableCells) {
        const pathMatch = cell.match(/([~./][\w/._-]+\.md)/);
        if (pathMatch) {
          const p = pathMatch[1];
          if (p.startsWith("http")) continue;
          add(p, "table entry", "table-entry");
        }
      }
    }
  }

  return { references };
}

function extractContext(line: string, _refPath: string): string {
  // Clean up the line for context
  let ctx = line
    .replace(/^[#\-*>|\s]+/, "") // strip markdown prefix
    .replace(/`[^`]*`/g, "") // strip backticks
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown links to text
    .trim();

  if (ctx.length > 60) ctx = ctx.slice(0, 57) + "...";
  return ctx || "referenced file";
}
