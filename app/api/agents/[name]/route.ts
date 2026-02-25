import { NextRequest, NextResponse } from "next/server";
import { jsonWithCache } from "@/lib/api/cache-headers";
import { deleteAgentMeta } from "@/lib/db/agent-catalog";
import { getDb } from "@/lib/db";
import { detachAttachmentsForTarget } from "@/lib/db/instruction-files";
import type { ConfigProvider } from "@/types/provider";
import type { Agent } from "@/types/agent";
import { validateAgentName } from "@/lib/agents/parser";
import {
  getProviderAgent,
  saveProviderAgent,
  deleteProviderAgent,
} from "@/lib/providers/agent-files";

function isConfigProvider(value: string): value is ConfigProvider {
  return value === "claude" || value === "codex" || value === "gemini";
}

function normalizeAreaPath(value: unknown): { value?: string; error?: string } {
  if (typeof value !== "string") return { value: undefined };
  const trimmed = value.trim();
  if (!trimmed) return { value: undefined };
  const normalized = trimmed.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("~/") ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return {
      error: "areaPath must be a relative path within the selected project",
    };
  }
  const segments: string[] = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      return { error: "areaPath must stay within the selected project" };
    }
    segments.push(segment);
  }
  return { value: segments.length > 0 ? segments.join("/") : undefined };
}

function resolveProvider(request: NextRequest):
  | { ok: true; provider: ConfigProvider }
  | { ok: false; response: NextResponse } {
  const providerParam = request.nextUrl.searchParams.get("provider");
  if (providerParam && !isConfigProvider(providerParam)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Invalid provider",
          code: "invalid_provider",
          details: { provider: providerParam },
        },
        { status: 400 },
      ),
    };
  }
  const provider: ConfigProvider =
    providerParam && isConfigProvider(providerParam) ? providerParam : "claude";
  return { ok: true, provider };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const providerResult = resolveProvider(request);
  if (!providerResult.ok) return providerResult.response;

  const { name } = await params;
  const projectPath = request.nextUrl.searchParams.get("projectPath") || undefined;
  const agent = getProviderAgent(providerResult.provider, name, projectPath);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  return jsonWithCache(agent, "detail");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const providerResult = resolveProvider(request);
  if (!providerResult.ok) return providerResult.response;

  const { name } = await params;
  const projectPath = request.nextUrl.searchParams.get("projectPath") || undefined;
  const existing = getProviderAgent(providerResult.provider, name, projectPath);
  if (!existing) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = (await request.json()) as Partial<Agent>;
  const nextName = existing.name;
  const nameError = validateAgentName(nextName);
  if (nameError) {
    return NextResponse.json(
      { error: nameError, code: "invalid_agent_name" },
      { status: 400 },
    );
  }
  const nextPrompt =
    typeof body.prompt === "string" ? body.prompt : existing.prompt;
  if (!nextPrompt?.trim()) {
    return NextResponse.json(
      { error: "prompt is required", code: "missing_agent_prompt" },
      { status: 400 },
    );
  }

  const hasAreaPathInBody = Object.prototype.hasOwnProperty.call(body, "areaPath");
  const nextAreaCandidate = hasAreaPathInBody ? body.areaPath : existing.areaPath;
  const normalizedAreaPath = projectPath
    ? normalizeAreaPath(nextAreaCandidate)
    : { value: undefined as string | undefined };
  if (normalizedAreaPath.error) {
    return NextResponse.json(
      { error: normalizedAreaPath.error, code: "invalid_area_path" },
      { status: 400 },
    );
  }

  const updated: Agent = {
    ...existing,
    ...body,
    name: nextName,
    prompt: nextPrompt,
    provider: providerResult.provider,
    scope: projectPath ? "project" : "global",
    projectPath,
    areaPath: projectPath ? normalizedAreaPath.value : undefined,
  };

  saveProviderAgent(providerResult.provider, updated, projectPath);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const providerResult = resolveProvider(request);
  if (!providerResult.ok) return providerResult.response;

  const { name } = await params;
  const projectPath = request.nextUrl.searchParams.get("projectPath") || undefined;
  const agent = getProviderAgent(providerResult.provider, name, projectPath);
  if (agent && providerResult.provider === "claude") {
    const db = getDb();
    db.prepare(
      "UPDATE instruction_files SET is_active = 0, updated_at = ? WHERE file_path = ?",
    ).run(new Date().toISOString(), agent.filePath);
  }

  const deleted = deleteProviderAgent(providerResult.provider, name, projectPath);
  deleteAgentMeta(name, {
    provider: providerResult.provider,
    projectPath: projectPath ?? null,
  });
  if (!deleted) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  detachAttachmentsForTarget("agent", name);
  return NextResponse.json({ success: true });
}
