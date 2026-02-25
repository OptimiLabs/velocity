import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { getDb, ensureIndexed } from "@/lib/db";
import { estimateTokens } from "@/lib/memory/token-counter";
import {
  resolveProjectRealPath,
  isClaudeMdRelevant,
  shortenPath,
} from "@/lib/context/helpers";
import {
  parseConfigProvider,
  getProviderMcpCacheFile,
} from "@/lib/providers/mcp-settings";
import type { ConfigProvider } from "@/types/provider";

interface MCPToolEntry {
  name: string;
  description?: string;
  inputSchema?: object;
}

interface MCPServerCache {
  tools: MCPToolEntry[];
  fetchedAt: number;
  error?: string;
}

type MCPToolCache = Record<string, MCPServerCache>;

// Constants reverse-engineered from Claude Code's /context output
const SYSTEM_PROMPT_TOKENS = 6000;
const SYSTEM_TOOLS_TOKENS = 18300;

function providerLabel(provider: ConfigProvider): string {
  if (provider === "codex") return "Codex";
  if (provider === "gemini") return "Gemini";
  return "Claude";
}

function readMcpCache(provider: ConfigProvider): MCPToolCache {
  try {
    const cacheFile = getProviderMcpCacheFile(provider);
    return JSON.parse(readFileSync(cacheFile, "utf-8"));
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const provider =
    parseConfigProvider(searchParams.get("provider") ?? "claude") ?? "claude";

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const realProjectPath = resolveProjectRealPath(db, projectId);

  // ── Memory files (CLAUDE.md) ──────────────────────────────────
  const allClaudeRows = db
    .prepare(
      `SELECT file_path, file_name, token_count, project_id
       FROM instruction_files
       WHERE is_active = 1 AND file_type = 'CLAUDE.md'`,
    )
    .all() as {
    file_path: string;
    file_name: string;
    token_count: number;
    project_id: string | null;
  }[];

  const claudeRows = realProjectPath
    ? allClaudeRows.filter((r) =>
        isClaudeMdRelevant(r.file_path, realProjectPath),
      )
    : allClaudeRows.filter((r) => !r.project_id || r.project_id === projectId);

  const memoryItems = claudeRows.map((r) => ({
    name: shortenPath(r.file_path),
    tokens: r.token_count,
    detail: r.file_name,
  }));

  // ── Skills ────────────────────────────────────────────────────
  const skillRows = db
    .prepare(
      `SELECT file_path, file_name, token_count
       FROM instruction_files
       WHERE is_active = 1 AND file_type = 'skill'
         AND (project_id IS NULL OR project_id = ?)`,
    )
    .all(projectId) as {
    file_path: string;
    file_name: string;
    token_count: number;
  }[];

  const skillItems = skillRows.map((r) => ({
    name: r.file_name,
    tokens: r.token_count,
    detail: shortenPath(r.file_path),
  }));

  // ── Agents ────────────────────────────────────────────────────
  const agentRows = db
    .prepare(
      `SELECT file_path, file_name, token_count
       FROM instruction_files
       WHERE is_active = 1 AND file_type = 'agent'
         AND (project_id IS NULL OR project_id = ?)`,
    )
    .all(projectId) as {
    file_path: string;
    file_name: string;
    token_count: number;
  }[];

  const agentItems = agentRows.map((r) => ({
    name: r.file_name,
    tokens: r.token_count,
    detail: shortenPath(r.file_path),
  }));

  // ── MCP Tools ─────────────────────────────────────────────────
  const mcpCache = readMcpCache(provider);
  const mcpItems: { name: string; tokens: number; detail?: string }[] = [];

  for (const [serverName, serverData] of Object.entries(mcpCache)) {
    if (serverData.error || !serverData.tools?.length) continue;
    let serverTokens = 0;
    for (const tool of serverData.tools) {
      serverTokens += estimateTokens(
        JSON.stringify({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }),
      );
    }
    mcpItems.push({
      name: serverName,
      tokens: serverTokens,
      detail: `${serverData.tools.length} tools`,
    });
  }

  // ── Build categories ──────────────────────────────────────────
  const sumTokens = (items: { tokens: number }[]) =>
    items.reduce((s, i) => s + i.tokens, 0);

  const categories = [
    {
      key: "system_prompt",
      label: "System Prompt",
      tokens: SYSTEM_PROMPT_TOKENS,
      items: [
        {
          name: `${providerLabel(provider)} system instructions`,
          tokens: SYSTEM_PROMPT_TOKENS,
        },
      ],
    },
    {
      key: "system_tools",
      label: "System Tools",
      tokens: SYSTEM_TOOLS_TOKENS,
      items: [
        {
          name: "Built-in tool schemas (Read, Write, Bash, etc.)",
          tokens: SYSTEM_TOOLS_TOKENS,
        },
      ],
    },
    {
      key: "mcp_tools",
      label: "MCP Tools",
      tokens: sumTokens(mcpItems),
      items: mcpItems,
    },
    {
      key: "agents",
      label: "Custom Agents",
      tokens: sumTokens(agentItems),
      items: agentItems,
    },
    {
      key: "memory",
      label: "Memory Files",
      tokens: sumTokens(memoryItems),
      items: memoryItems,
    },
    {
      key: "skills",
      label: "Skills",
      tokens: sumTokens(skillItems),
      items: skillItems,
    },
  ];

  const staticTotal = categories.reduce((s, c) => s + c.tokens, 0);

  return NextResponse.json({ categories, staticTotal });
}
