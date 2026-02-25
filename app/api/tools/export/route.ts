import { NextRequest, NextResponse } from "next/server";
import { readFile, mkdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

export async function POST(request: NextRequest) {
  try {
    const { pluginName, skills, description } = (await request.json()) as {
      pluginName: string;
      skills: string[];
      description?: string;
    };

    if (!pluginName?.trim()) {
      return NextResponse.json(
        { error: "Plugin name is required" },
        { status: 400 },
      );
    }
    if (!skills?.length) {
      return NextResponse.json(
        { error: "At least one skill is required" },
        { status: 400 },
      );
    }

    const home = homedir();
    const pluginDir = join(home, ".claude", "plugins", pluginName.trim());
    const skillsDir = join(pluginDir, "skills");

    // Create directories
    await mkdir(skillsDir, { recursive: true });

    const structure: string[] = [];
    const skillNames: string[] = [];

    // Copy each skill
    for (const skillName of skills) {
      const sourcePath = join(home, ".claude", "commands", `${skillName}.md`);
      try {
        const content = await readFile(sourcePath, "utf-8");
        const skillDir = join(skillsDir, skillName);
        await mkdir(skillDir, { recursive: true });
        await writeFile(join(skillDir, "SKILL.md"), content, "utf-8");
        structure.push(`skills/${skillName}/SKILL.md`);
        skillNames.push(skillName);
      } catch {
        // Skill file may not exist — skip
      }
    }

    // Generate README
    const readme = [
      `# ${pluginName}`,
      "",
      description || `A Claude Code plugin bundling custom skills.`,
      "",
      "## Skills",
      "",
      ...skillNames.map((s) => `- \`/${s}\``),
      "",
      "## Installation",
      "",
      "```bash",
      `claude plugin add ${pluginName}`,
      "```",
    ].join("\n");
    await writeFile(join(pluginDir, "README.md"), readme, "utf-8");
    structure.push("README.md");

    // Generate package.json
    const pkg = {
      name: pluginName.trim(),
      version: "1.0.0",
      description: description || `Claude Code plugin: ${pluginName}`,
      keywords: ["claude-code-plugin"],
    };
    await writeFile(
      join(pluginDir, "package.json"),
      JSON.stringify(pkg, null, 2) + "\n",
      "utf-8",
    );
    structure.push("package.json");

    return NextResponse.json({ path: pluginDir, structure });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
