import { NextResponse } from "next/server";
import { readFile, readdir, access } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { ToolInfo } from "@/types/tools";
import { readSettings } from "@/lib/claude-settings";
import {
  parseConfigProvider,
  readProviderMcpState,
} from "@/lib/providers/mcp-settings";

const BUILTIN_TOOLS: ToolInfo[] = [
  {
    name: "Read",
    type: "builtin",
    description: "Read files from the filesystem",
  },
  {
    name: "Write",
    type: "builtin",
    description: "Write files to the filesystem",
  },
  {
    name: "Edit",
    type: "builtin",
    description: "Edit files with string replacements",
  },
  { name: "Bash", type: "builtin", description: "Execute shell commands" },
  { name: "Glob", type: "builtin", description: "Find files by pattern" },
  { name: "Grep", type: "builtin", description: "Search file contents" },
  {
    name: "Task",
    type: "builtin",
    description: "Launch sub-agents for complex tasks",
  },
  {
    name: "WebFetch",
    type: "builtin",
    description: "Fetch and process web content",
  },
  { name: "WebSearch", type: "builtin", description: "Search the web" },
  {
    name: "NotebookEdit",
    type: "builtin",
    description: "Edit Jupyter notebooks",
  },
];

// Parse frontmatter from SKILL.md files
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providerParam = searchParams.get("provider");
  const provider = parseConfigProvider(providerParam ?? "claude");
  if (!provider) {
    return NextResponse.json(
      { error: `Invalid provider: ${providerParam}` },
      { status: 400 },
    );
  }

  const tools: ToolInfo[] = BUILTIN_TOOLS.map((tool) => ({
    ...tool,
    provider,
  }));
  const home = homedir();
  const mcpState = readProviderMcpState(provider);
  for (const [name, config] of Object.entries(mcpState.enabled)) {
    const mcpArgs = Array.isArray(config.args) ? config.args.join(" ") : undefined;
    tools.push({
      name,
      provider,
      type: "mcp",
      enabled: true,
      description: config.url
        ? `URL: ${config.url}`
        : config.command
          ? `${config.command}${mcpArgs ? " " + mcpArgs : ""}`
          : "MCP Server",
      server: name,
      url: config.url,
      command: config.command,
      args: Array.isArray(config.args) ? config.args : undefined,
      env: config.env,
      headers: config.headers,
    });
  }

  for (const [name, config] of Object.entries(mcpState.disabled)) {
    const mcpArgs = Array.isArray(config.args) ? config.args.join(" ") : undefined;
    tools.push({
      name,
      provider,
      type: "mcp",
      enabled: false,
      description: config.url
        ? `URL: ${config.url}`
        : config.command
          ? `${config.command}${mcpArgs ? " " + mcpArgs : ""}`
          : "MCP Server (disabled)",
      server: name,
      url: config.url,
      command: config.command,
      args: Array.isArray(config.args) ? config.args : undefined,
      env: config.env,
      headers: config.headers,
    });
  }

  if (provider !== "claude") {
    return NextResponse.json(tools);
  }

  let enabledPlugins: Record<string, boolean> = {};
  try {
    enabledPlugins = readSettings().enabledPlugins || {};
  } catch {
    enabledPlugins = {};
  }

  // Track MCP server names already added (from settings.json) for deduplication
  const mcpServerNames = new Set(
    tools.filter((t) => t.type === "mcp").map((t) => t.name),
  );

  // Read plugins from ~/.claude/plugins/installed_plugins.json (v2 format)
  try {
    const pluginsPath = join(
      home,
      ".claude",
      "plugins",
      "installed_plugins.json",
    );
    const raw = await readFile(pluginsPath, "utf-8");
    const data = JSON.parse(raw);
    const pluginsMap = data.plugins || {};

    for (const [pluginId, installs] of Object.entries(pluginsMap)) {
      const installList = installs as Array<{
        version?: string;
        installPath?: string;
      }>;
      if (!Array.isArray(installList) || installList.length === 0) continue;

      // Use the latest install entry
      const latest = installList[installList.length - 1];
      const shortName = pluginId.split("@")[0]; // e.g. "superpowers" from "superpowers@claude-plugins-official"
      const registry = pluginId.includes("@")
        ? pluginId.split("@")[1]
        : undefined;
      const isEnabled = enabledPlugins[pluginId] === true;

      // Try to read plugin description from README.md
      let pluginDescription: string | undefined;
      if (latest.installPath) {
        try {
          const readmePath = join(latest.installPath, "README.md");
          const readmeContent = await readFile(readmePath, "utf-8");
          // Extract first paragraph after title
          const lines = readmeContent.split("\n");
          let foundTitle = false;
          for (const line of lines) {
            if (line.startsWith("# ")) {
              foundTitle = true;
              continue;
            }
            if (foundTitle && line.trim()) {
              pluginDescription = line.trim().slice(0, 200);
              break;
            }
          }
        } catch {
          // README.md may not exist
        }
      }

      // Build GitHub link for official registry plugins
      const pluginUrl =
        registry === "claude-plugins-official"
          ? `https://github.com/anthropics/claude-code-plugins/tree/main/${shortName}`
          : undefined;

      tools.push({
        name: shortName,
        provider,
        type: "plugin",
        version: latest.version,
        enabled: isEnabled,
        description: pluginDescription || `Plugin: ${shortName}`,
        pluginId,
        registry,
        url: pluginUrl,
        installPath: latest.installPath,
      });

      // Discover skills inside this plugin
      if (latest.installPath) {
        try {
          const skillsDir = join(latest.installPath, "skills");
          await access(skillsDir);
          const skillDirs = await readdir(skillsDir);

          for (const skillDir of skillDirs) {
            try {
              const skillPath = join(skillsDir, skillDir, "SKILL.md");
              const skillContent = await readFile(skillPath, "utf-8");
              const frontmatter = parseFrontmatter(skillContent);
              tools.push({
                name: frontmatter.name || skillDir,
                provider,
                type: "skill",
                description: frontmatter.description,
                plugin: shortName,
                content: skillContent,
                installPath: latest.installPath,
              });
            } catch {
              // SKILL.md may not exist in this directory
            }
          }
        } catch {
          // No skills directory
        }

        // Discover MCP servers provided by this plugin via .mcp.json
        try {
          const mcpJsonPath = join(latest.installPath, ".mcp.json");
          const mcpRaw = await readFile(mcpJsonPath, "utf-8");
          const mcpConfig = JSON.parse(mcpRaw) as Record<
            string,
            {
              command?: string;
              args?: string[];
              url?: string;
              env?: Record<string, string>;
              headers?: Record<string, string>;
            }
          >;

          for (const [serverName, cfg] of Object.entries(mcpConfig)) {
            // Skip if already defined in settings.json (user config takes precedence)
            if (mcpServerNames.has(serverName)) continue;

            const mcpArgs = Array.isArray(cfg.args)
              ? cfg.args.join(" ")
              : undefined;

            tools.push({
              name: serverName,
              provider,
              type: "mcp",
              enabled: isEnabled,
              description: cfg.url
                ? `URL: ${cfg.url}`
                : cfg.command
                  ? `${cfg.command}${mcpArgs ? " " + mcpArgs : ""}`
                  : "MCP Server",
              server: serverName,
              url: cfg.url,
              command: cfg.command,
              args: cfg.args,
              env: cfg.env,
              headers: cfg.headers,
              plugin: shortName,
              pluginId,
            });

            mcpServerNames.add(serverName);
          }
        } catch {
          // .mcp.json may not exist for this plugin
        }
      }
    }
  } catch {
    // plugins file may not exist
  }

  return NextResponse.json(tools);
}
