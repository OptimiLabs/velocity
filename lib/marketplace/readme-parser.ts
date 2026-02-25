import type { MarketplaceItem } from "@/types/marketplace";

export interface ParsedItem {
  name: string;
  description: string;
  type: MarketplaceItem["type"];
  /** For MCP servers: the config to install with */
  installConfig?: { command: string; args: string[] };
}

/**
 * Parse a README for installable items:
 * - `npx -y @scope/pkg` commands in code blocks → MCP servers
 * - `claude mcp add <name> -- npx -y <pkg>` → MCP servers
 * - JSON blocks with "command" + "args" → MCP server configs
 * - Named sections with MCP server configs
 */
export function parseReadmeForItems(readme: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const seen = new Set<string>();

  // Extract code blocks
  const codeBlockRe = /```[^\n]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(readme)) !== null) {
    const block = match[1];

    // Pattern 1: `claude mcp add <name> -- npx -y <pkg>`
    const mcpAddRe =
      /claude\s+mcp\s+add\s+([\w-]+)\s+--\s+npx\s+(?:-y\s+)?([@\w/.-]+)/g;
    let mcpMatch: RegExpExecArray | null;
    while ((mcpMatch = mcpAddRe.exec(block)) !== null) {
      const serverName = mcpMatch[1];
      const pkg = mcpMatch[2];
      if (!seen.has(serverName)) {
        seen.add(serverName);
        items.push({
          name: serverName,
          description: `MCP server: ${pkg}`,
          type: "mcp-server",
          installConfig: { command: "npx", args: ["-y", pkg] },
        });
      }
    }

    // Pattern 2: JSON config with "command" and "args"
    const jsonBlockRe =
      /\{[\s\S]*?"command"\s*:\s*"([^"]+)"[\s\S]*?"args"\s*:\s*\[([\s\S]*?)\][\s\S]*?\}/g;
    let jsonMatch: RegExpExecArray | null;
    while ((jsonMatch = jsonBlockRe.exec(block)) !== null) {
      const command = jsonMatch[1];
      const argsRaw = jsonMatch[2];
      const args = [...argsRaw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      // Derive name from package
      const pkg = args.find(
        (a) => a.startsWith("@") || (!a.startsWith("-") && a !== command),
      );
      if (pkg) {
        const serverName = pkg
          .replace(/^@[^/]+\//, "")
          .replace(/[^a-zA-Z0-9-_]/g, "-");
        if (!seen.has(serverName)) {
          seen.add(serverName);
          items.push({
            name: serverName,
            description: `MCP server: ${command} ${args.join(" ")}`,
            type: "mcp-server",
            installConfig: { command, args },
          });
        }
      }
    }

    // Pattern 3: standalone `npx -y <pkg>` or `npx <pkg>` (not already caught)
    const npxRe = /\bnpx\s+(?:-y\s+)?([@\w/.-]+)/g;
    let npxMatch: RegExpExecArray | null;
    while ((npxMatch = npxRe.exec(block)) !== null) {
      const pkg = npxMatch[1];
      // Skip common non-package args
      if (
        pkg.startsWith("-") ||
        ["create", "eslint", "prettier", "tsc"].includes(pkg)
      )
        continue;
      const serverName = pkg
        .replace(/^@[^/]+\//, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-");
      if (!seen.has(serverName)) {
        seen.add(serverName);
        items.push({
          name: serverName,
          description: `MCP server: npx -y ${pkg}`,
          type: "mcp-server",
          installConfig: { command: "npx", args: ["-y", pkg] },
        });
      }
    }
  }

  // Pattern 4: mcpServers config object outside code blocks
  // "server-name": { "command": "npx", "args": ["-y", "@scope/pkg"] }
  const mcpServersRe =
    /"([\w-]+)"\s*:\s*\{\s*"command"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*\[([\s\S]*?)\]\s*\}/g;
  let srvMatch: RegExpExecArray | null;
  while ((srvMatch = mcpServersRe.exec(readme)) !== null) {
    const serverName = srvMatch[1];
    const command = srvMatch[2];
    const argsRaw = srvMatch[3];
    const args = [...argsRaw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (!seen.has(serverName)) {
      seen.add(serverName);
      items.push({
        name: serverName,
        description: `MCP server: ${command} ${args.join(" ")}`,
        type: "mcp-server",
        installConfig: { command, args },
      });
    }
  }

  return items;
}
