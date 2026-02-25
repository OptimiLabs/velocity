export interface SplitSection {
  heading: string;
  headingLevel: number;
  content: string;
  suggestedCategory: string;
  suggestedFilename: string;
  tokenEstimate: number;
}

export interface SplitResult {
  preamble: string;
  sections: SplitSection[];
  sourceFile: string;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  frontend: [
    "frontend",
    "ui",
    "component",
    "style",
    "tailwind",
    "css",
    "layout",
    "design",
  ],
  backend: [
    "backend",
    "api",
    "server",
    "database",
    "db",
    "schema",
    "route",
    "endpoint",
  ],
  frameworks: [
    "framework",
    "next",
    "react",
    "typescript",
    "vue",
    "svelte",
    "angular",
  ],
  workflows: [
    "workflow",
    "git",
    "deploy",
    "ci",
    "process",
    "debug",
    "test",
    "migration",
  ],
  tools: ["tool", "command", "cli", "script", "bun", "npm", "docker", "lint"],
};

export function classifyCategory(heading: string): string {
  const lower = heading.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }
  return "general";
}

function slugify(heading: string): string {
  return heading
    .replace(/^#+\s*/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function splitClaudeMd(
  content: string,
  sourcePath: string,
): SplitResult {
  const lines = content.split("\n");

  // Determine primary heading level (## or ###)
  let h2Count = 0;
  let h3Count = 0;
  for (const line of lines) {
    if (/^## [^#]/.test(line)) h2Count++;
    if (/^### [^#]/.test(line)) h3Count++;
  }
  const primaryLevel = h2Count >= h3Count ? 2 : 3;
  const headingPrefix = "#".repeat(primaryLevel) + " ";

  const preambleLines: string[] = [];
  const sections: SplitSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (
      line.startsWith(headingPrefix) &&
      !line.startsWith(headingPrefix + "#")
    ) {
      // Flush previous section
      if (currentHeading !== null) {
        const sectionContent = currentLines.join("\n").trim();
        const fullContent = `${currentHeading}\n\n${sectionContent}`;
        sections.push({
          heading: currentHeading,
          headingLevel: primaryLevel,
          content: fullContent,
          suggestedCategory: classifyCategory(currentHeading),
          suggestedFilename: `${slugify(currentHeading)}.md`,
          tokenEstimate: Math.ceil(fullContent.length / 4),
        });
      }
      currentHeading = line;
      currentLines = [];
    } else if (currentHeading === null) {
      preambleLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  // Flush last section
  if (currentHeading !== null) {
    const sectionContent = currentLines.join("\n").trim();
    const fullContent = `${currentHeading}\n\n${sectionContent}`;
    sections.push({
      heading: currentHeading,
      headingLevel: primaryLevel,
      content: fullContent,
      suggestedCategory: classifyCategory(currentHeading),
      suggestedFilename: `${slugify(currentHeading)}.md`,
      tokenEstimate: Math.ceil(fullContent.length / 4),
    });
  }

  return {
    preamble: preambleLines.join("\n").trim(),
    sections,
    sourceFile: sourcePath,
  };
}
