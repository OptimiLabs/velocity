import { NextResponse } from "next/server";
import fs from "fs";
import {
  addManualEdge,
  removeManualEdge,
  readFullGraph,
} from "@/lib/db/routing-graph";

// POST: add edge + write reference back to source CLAUDE.md
export async function POST(req: Request) {
  const body = await req.json();
  const { source, target, context } = body;

  if (!source || !target) {
    return NextResponse.json(
      { error: "source and target required" },
      { status: 400 },
    );
  }

  addManualEdge(source, target, context || "");

  // Write reference back to source CLAUDE.md file
  try {
    if (fs.existsSync(source)) {
      let content = fs.readFileSync(source, "utf-8");
      const refLine = `- See \`${target}\` — ${context || "referenced file"}`;

      // Check if a References section exists
      const refSectionMatch = content.match(/^## References\b/m);
      if (refSectionMatch) {
        // Append under existing References section
        const idx =
          content.indexOf(refSectionMatch[0]) + refSectionMatch[0].length;
        content = content.slice(0, idx) + "\n" + refLine + content.slice(idx);
      } else {
        // Append at end
        content = content.trimEnd() + "\n\n## References\n" + refLine + "\n";
      }

      fs.writeFileSync(source, content, "utf-8");
    }
  } catch {
    // Write-back failed, but graph update succeeded
  }

  const graph = readFullGraph();
  return NextResponse.json({ graph });
}

// DELETE: remove edge + remove reference from source CLAUDE.md
export async function DELETE(req: Request) {
  const body = await req.json();
  const { source, target } = body;

  if (!source || !target) {
    return NextResponse.json(
      { error: "source and target required" },
      { status: 400 },
    );
  }

  removeManualEdge(source, target);

  // Remove reference from source file
  try {
    if (fs.existsSync(source)) {
      let content = fs.readFileSync(source, "utf-8");
      const lines = content.split("\n");
      const filtered = lines.filter((line) => {
        if (line.includes(target)) {
          return !line.match(/^-\s+See\s+`.*`/);
        }
        return true;
      });
      content = filtered.join("\n");
      fs.writeFileSync(source, content, "utf-8");
    }
  } catch {
    // Write-back failed
  }

  const graph = readFullGraph();
  return NextResponse.json({ graph });
}
