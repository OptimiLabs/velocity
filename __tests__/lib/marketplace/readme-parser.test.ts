import { describe, it, expect } from "vitest";
import { parseReadmeForItems } from "@/lib/marketplace/readme-parser";

describe("parseReadmeForItems", () => {
  describe("claude mcp add pattern", () => {
    it("extracts MCP server from 'claude mcp add' command in code block", () => {
      const readme = `
# My MCP Tool

\`\`\`bash
claude mcp add my-server -- npx -y @scope/my-server-pkg
\`\`\`
`;
      const items = parseReadmeForItems(readme);
      // Pattern 1 extracts "my-server", Pattern 3 also catches npx as "my-server-pkg"
      expect(items.length).toBeGreaterThanOrEqual(1);
      const myServer = items.find((i) => i.name === "my-server");
      expect(myServer).toBeDefined();
      expect(myServer!.type).toBe("mcp-server");
      expect(myServer!.installConfig).toEqual({
        command: "npx",
        args: ["-y", "@scope/my-server-pkg"],
      });
    });

    it("extracts MCP server when npx does not have -y flag", () => {
      const readme = `
\`\`\`bash
claude mcp add simple-srv -- npx @example/simple
\`\`\`
`;
      const items = parseReadmeForItems(readme);
      // Pattern 1 extracts "simple-srv", Pattern 3 also catches "simple"
      expect(items.length).toBeGreaterThanOrEqual(1);
      const srv = items.find((i) => i.name === "simple-srv");
      expect(srv).toBeDefined();
    });
  });

  describe("JSON config pattern", () => {
    it("extracts MCP server from JSON config block with command and args", () => {
      const readme = `
\`\`\`json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"]
}
\`\`\`
`;
      const items = parseReadmeForItems(readme);
      expect(items.length).toBeGreaterThanOrEqual(1);
      const fsServer = items.find((i) => i.name === "server-filesystem");
      expect(fsServer).toBeDefined();
      expect(fsServer!.type).toBe("mcp-server");
      expect(fsServer!.installConfig?.command).toBe("npx");
    });
  });

  describe("standalone npx pattern", () => {
    it("extracts MCP server from standalone npx command", () => {
      const readme = `
\`\`\`bash
npx -y @anthropic/mcp-tool
\`\`\`
`;
      const items = parseReadmeForItems(readme);
      expect(items.length).toBeGreaterThanOrEqual(1);
      const tool = items.find((i) => i.name === "mcp-tool");
      expect(tool).toBeDefined();
      expect(tool!.installConfig).toEqual({
        command: "npx",
        args: ["-y", "@anthropic/mcp-tool"],
      });
    });

    it("skips common non-package npx args like eslint, prettier", () => {
      const readme = `
\`\`\`bash
npx eslint .
npx prettier --write .
npx create my-app
npx tsc --init
\`\`\`
`;
      const items = parseReadmeForItems(readme);
      expect(items).toHaveLength(0);
    });
  });

  describe("mcpServers config pattern (outside code blocks)", () => {
    it("extracts from mcpServers JSON config object", () => {
      const readme = `
Configure your settings:

"my-tool": { "command": "node", "args": ["dist/index.js"] }
`;
      const items = parseReadmeForItems(readme);
      expect(items.length).toBeGreaterThanOrEqual(1);
      const tool = items.find((i) => i.name === "my-tool");
      expect(tool).toBeDefined();
      expect(tool!.installConfig?.command).toBe("node");
      expect(tool!.installConfig?.args).toEqual(["dist/index.js"]);
    });
  });

  describe("deduplication", () => {
    it("deduplicates servers with the same derived name", () => {
      const readme = `
\`\`\`bash
claude mcp add my-server -- npx -y @scope/my-server
npx -y @scope/my-server
\`\`\`
`;
      const items = parseReadmeForItems(readme);
      // "my-server" should appear only once
      const myServerItems = items.filter((i) => i.name === "my-server");
      expect(myServerItems).toHaveLength(1);
    });
  });

  describe("multiple servers in one README", () => {
    it("extracts multiple different servers", () => {
      const readme = `
# Installation

\`\`\`bash
claude mcp add server-a -- npx -y @org/server-a
claude mcp add server-b -- npx -y @org/server-b
\`\`\`
`;
      const items = parseReadmeForItems(readme);
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.name).sort()).toEqual(["server-a", "server-b"]);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty string", () => {
      expect(parseReadmeForItems("")).toEqual([]);
    });

    it("returns empty array for README with no code blocks or patterns", () => {
      const readme = `
# My Project

This is a simple project with no MCP servers.

## Features
- Feature 1
- Feature 2
`;
      expect(parseReadmeForItems(readme)).toEqual([]);
    });

    it("handles README with code blocks but no MCP patterns", () => {
      const readme = `
\`\`\`javascript
console.log("hello world");
\`\`\`
`;
      expect(parseReadmeForItems(readme)).toEqual([]);
    });

    it("derives server name by stripping scope prefix", () => {
      const readme = `
\`\`\`bash
npx -y @myorg/fancy-server
\`\`\`
`;
      const items = parseReadmeForItems(readme);
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items[0].name).toBe("fancy-server");
    });
  });
});
