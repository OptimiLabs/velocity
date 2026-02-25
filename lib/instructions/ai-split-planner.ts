import { classifyCategory } from "./claudemd-splitter";
import type { SplitSection } from "./claudemd-splitter";

export interface AISplitAssignment {
  index: number;
  category: string;
  filename: string;
}

export function buildAISplitPlanPrompt(
  sections: SplitSection[],
  opts: {
    guidelines?: string;
    structureMode: "existing" | "ai-decide";
    existingCategories?: string[];
    existingFiles?: { category: string; filename: string }[];
  },
): string {
  const sectionSummaries = sections
    .map((s, i) => {
      const heading = s.heading.replace(/^#+\s*/, "");
      const preview = s.content.slice(0, 200).replace(/\n/g, " ");
      return `<section index="${i}" heading="${heading}" tokens="${s.tokenEstimate}">${preview}</section>`;
    })
    .join("\n");

  const constraintBlock =
    opts.structureMode === "existing" && opts.existingCategories?.length
      ? `<constraint>You MUST use ONLY these existing categories: ${opts.existingCategories.join(", ")}</constraint>`
      : `<constraint>Propose clear, short category folder names (lowercase, no spaces). Common examples: frontend, backend, frameworks, workflows, tools, general.</constraint>`;

  const existingFilesBlock = opts.existingFiles?.length
    ? `<existing_files>\n${opts.existingFiles.map((f) => `${f.category}/${f.filename}`).join("\n")}\n</existing_files>`
    : "";

  const guidelinesBlock = opts.guidelines?.trim()
    ? `<user_guidelines>${opts.guidelines.trim()}</user_guidelines>`
    : "";

  return `<instructions>
You are organizing sections of a CLAUDE.md file into categorized knowledge files.
For each section, assign a category folder and a descriptive filename (kebab-case, ending in .md).

${constraintBlock}
${guidelinesBlock}
${existingFilesBlock}

Return ONLY a JSON array — no markdown fences, no explanation:
[{"index": 0, "category": "backend", "filename": "database-patterns.md"}, ...]
</instructions>

<sections>
${sectionSummaries}
</sections>`;
}

export function parseAISplitPlanResponse(
  aiResponse: string,
  sections: SplitSection[],
): AISplitAssignment[] {
  try {
    // Extract JSON array from response (handle possible markdown fences)
    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/) ?? null;
    if (!jsonMatch) throw new Error("No JSON array found");

    const parsed = JSON.parse(jsonMatch[0]) as {
      index: number;
      category: string;
      filename: string;
    }[];

    // Validate structure
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Empty or invalid array");
    }

    return parsed.map((item) => ({
      index: typeof item.index === "number" ? item.index : 0,
      category: (item.category || "general").toLowerCase().replace(/\s+/g, "-"),
      filename: item.filename?.endsWith(".md")
        ? item.filename
        : `${item.filename || "section"}.md`,
    }));
  } catch {
    // Fallback: use keyword-based classification
    return sections.map((s, i) => ({
      index: i,
      category: classifyCategory(s.heading),
      filename: s.suggestedFilename,
    }));
  }
}
