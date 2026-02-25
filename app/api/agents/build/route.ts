import { NextResponse } from "next/server";
import { aiGenerate } from "@/lib/ai/generate";
import { convertAgentTargets } from "@/lib/conversion/artifacts";
import type { ProviderTargetMode } from "@/types/provider-artifacts";
import { listActiveAIProviderConfigs } from "@/lib/db/instruction-files";
import {
  extractConfigFromText,
  normalizeGeneratedAgentConfig,
} from "@/lib/agents/config-normalizer";

const ALLOWED_EFFORTS = new Set(["low", "medium", "high"]);
const ALLOWED_PROVIDERS = new Set([
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "local",
  "custom",
]);

function firstLine(value: string, max = 200): string {
  return value.trim().split(/\r?\n/, 1)[0].slice(0, max);
}

function isModelIdSafe(value: string): boolean {
  return /^[a-zA-Z0-9._:-]{1,120}$/.test(value);
}

function parseNumberField(
  value: unknown,
  {
    min,
    max,
    integer = false,
  }: { min?: number; max?: number; integer?: boolean },
): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "") return undefined;
  const parsed =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(parsed)) return null;
  if (integer && !Number.isInteger(parsed)) return null;
  if (min !== undefined && parsed < min) return null;
  if (max !== undefined && parsed > max) return null;
  return parsed;
}

function normalizeRuntimeAgentModel(
  value: string | undefined,
  targetProvider: ProviderTargetMode,
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (targetProvider !== "claude" && targetProvider !== "all") return trimmed;

  const lower = trimmed.toLowerCase();
  if (lower === "opus" || lower.includes("opus")) return "opus";
  if (lower === "sonnet" || lower.includes("sonnet")) return "sonnet";
  if (lower === "haiku" || lower.includes("haiku")) return "haiku";
  return undefined;
}

function findActiveProviderDefaults(providerId: string): {
  modelId?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  thinkingBudget?: number;
  maxTokens?: number;
} {
  const rows = listActiveAIProviderConfigs();
  const row = rows.find((item) => {
    const slug = item.providerSlug ?? item.provider;
    return slug === providerId;
  });
  if (!row) return {};
  return {
    ...(row.modelId ? { modelId: row.modelId } : {}),
    ...(row.temperature != null ? { temperature: row.temperature } : {}),
    ...(row.topP != null ? { topP: row.topP } : {}),
    ...(row.topK != null ? { topK: row.topK } : {}),
    ...(row.thinkingBudget != null
      ? { thinkingBudget: row.thinkingBudget }
      : {}),
    ...(row.maxTokens != null ? { maxTokens: row.maxTokens } : {}),
  };
}

function normalizeTools(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tool = item.trim();
    if (!tool || seen.has(tool)) continue;
    seen.add(tool);
    out.push(tool);
  }
  return out;
}

function makeUniqueName(
  baseName: string,
  existingAgents?: { name: string; description: string }[],
): string {
  const taken = new Set(
    (existingAgents ?? [])
      .map((a) => (typeof a.name === "string" ? a.name.trim().toLowerCase() : ""))
      .filter(Boolean),
  );
  if (!taken.has(baseName.toLowerCase())) return baseName;

  for (let i = 2; i < 1000; i++) {
    const suffix = `-${i}`;
    const candidate = `${baseName.slice(0, Math.max(1, 30 - suffix.length))}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${baseName.slice(0, 28)}-x`;
}

const SYSTEM_PROMPT = `You generate Claude Code agent configurations as JSON. Output ONLY valid JSON, no markdown fences, no commentary.

Schema:
{
  "name": "kebab-case-name (max 30 chars)",
  "description": "One concise sentence summarizing the agent's purpose",
  "prompt": "Detailed system prompt (multi-paragraph)",
  "tools": ["Tool1", "Tool2"],
  "color": "#hex"
}

Available tools and when to use them:
- Read: Reading file contents — needed for review, analysis, understanding code
- Write: Creating new files from scratch
- Edit: Modifying existing files with surgical replacements
- Bash: Running shell commands (tests, builds, git, linting)
- Glob: Finding files by name patterns (e.g. "**/*.test.ts")
- Grep: Searching file contents with regex patterns
- Task: Spawning sub-agents for parallel or delegated work
- WebFetch: Fetching content from URLs
- WebSearch: Searching the web for documentation or references
- NotebookEdit: Editing Jupyter notebook cells

Tool selection guidance — choose tools that match the agent's workflow:
- A code reviewer needs Read, Glob, Grep but NOT Write
- A test writer needs Read, Write, Edit, Bash, Glob, Grep
- A documentation writer needs Read, Write, Glob, Grep
- A researcher needs Read, Glob, Grep, WebFetch, WebSearch

Colors: #ef4444 red, #f97316 orange, #eab308 yellow, #22c55e green, #3b82f6 blue, #7c3aed violet, #ec4899 pink, #06b6d4 cyan

Example output:
{
  "name": "security-reviewer",
  "description": "Reviews code changes for security vulnerabilities and unsafe patterns",
  "prompt": "You are a security-focused code reviewer. Your workflow:\\n\\n1. Use Glob to find recently modified files\\n2. Read each file and analyze for OWASP Top 10 vulnerabilities\\n3. Check for: SQL injection, XSS, command injection, path traversal, hardcoded secrets\\n4. For each finding, cite the exact file:line and explain the attack vector\\n5. Suggest a specific fix with corrected code\\n\\nPrioritize findings by severity (critical > high > medium > low). Skip informational style issues — focus exclusively on security.",
  "tools": ["Read", "Glob", "Grep"],
  "color": "#ef4444"
}

The "prompt" field is the most important — write specific domain procedures, not generic advice. Do NOT write prompts that say "be thorough", "ask for help", or "ensure quality". Instead, write step-by-step workflows with concrete actions the agent should take.`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const targetProvider = (
      body.targetProvider === "claude" ||
      body.targetProvider === "codex" ||
      body.targetProvider === "gemini" ||
      body.targetProvider === "all"
        ? body.targetProvider
        : "claude"
    ) as ProviderTargetMode;
    const legacyModel =
      typeof body.model === "string" ? body.model.trim() : undefined;
    const requestedGenerationModel =
      typeof body.generationModel === "string"
        ? body.generationModel.trim()
        : undefined;
    const requestedAgentModel =
      typeof body.agentModel === "string" ? body.agentModel.trim() : undefined;
    const requestedModel =
      requestedGenerationModel ?? (targetProvider === "claude" ? legacyModel : undefined);
    const agentModel = normalizeRuntimeAgentModel(
      requestedAgentModel || legacyModel,
      targetProvider,
    );
    const rawLegacyEffort =
      typeof body.effort === "string" ? body.effort.trim() : undefined;
    const rawAgentEffort =
      typeof body.agentEffort === "string"
        ? body.agentEffort.trim()
        : rawLegacyEffort;
    const effort = rawAgentEffort || undefined;
    const selectedTools = normalizeTools(body.tools);
    const provider =
      typeof body.provider === "string" ? body.provider.trim() : undefined;
    const temperature = parseNumberField(body.temperature, { min: 0, max: 2 });
    const topP = parseNumberField(body.topP, { min: 0, max: 1 });
    const topK = parseNumberField(body.topK, { min: 0, integer: true });
    const thinkingBudget = parseNumberField(body.thinkingBudget, {
      min: 0,
      integer: true,
    });
    const maxTokens = parseNumberField(body.maxTokens, {
      min: 1,
      integer: true,
    });
    const existingAgents = Array.isArray(body.existingAgents)
      ? body.existingAgents.filter(
          (a: unknown): a is { name: string; description: string } =>
            !!a &&
            typeof a === "object" &&
            typeof (a as { name?: unknown }).name === "string" &&
            typeof (a as { description?: unknown }).description === "string",
        )
      : undefined;

    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 },
      );
    }

    if (requestedModel && !isModelIdSafe(requestedModel)) {
      return NextResponse.json({ error: "invalid model" }, { status: 400 });
    }

    if (effort && !ALLOWED_EFFORTS.has(effort)) {
      return NextResponse.json({ error: "invalid effort" }, { status: 400 });
    }

    if (provider && !ALLOWED_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: "invalid provider" }, { status: 400 });
    }

    if (
      temperature === null ||
      topP === null ||
      topK === null ||
      thinkingBudget === null ||
      maxTokens === null
    ) {
      return NextResponse.json(
        { error: "invalid generation settings" },
        { status: 400 },
      );
    }

    const defaults = provider ? findActiveProviderDefaults(provider) : {};
    const generationModel = requestedModel ?? defaults.modelId;
    const generationTemperature = temperature ?? defaults.temperature;
    const generationTopP = topP ?? defaults.topP;
    const generationTopK = topK ?? defaults.topK;
    const generationThinkingBudget = thinkingBudget ?? defaults.thinkingBudget;
    const generationMaxTokens = maxTokens ?? defaults.maxTokens ?? 16_384;

    const toolsConstraint = selectedTools.length
      ? `\nThe user has specifically selected these tools: ${JSON.stringify(selectedTools)}. Use exactly these tools in your output.`
      : "\nChoose the most appropriate tools for this agent's purpose.";

    const existingBlock =
      existingAgents?.length > 0
        ? `\n\nExisting agents (avoid duplicating these):\n${existingAgents.map((a: { name: string; description: string }) => `- "${a.name}": ${a.description}`).join("\n")}\nCreate something distinct. If the user's request overlaps with an existing agent, make yours complementary rather than redundant. Choose a unique name that doesn't match any existing agent name.`
        : "";

    const userPrompt = `Generate an agent configuration for the following purpose:\n\n${description}${toolsConstraint}${existingBlock}`;

    const raw = await aiGenerate(userPrompt, {
      system: SYSTEM_PROMPT,
      model: generationModel,
      ...(provider ? { provider } : {}),
      ...(generationTemperature !== undefined
        ? { temperature: generationTemperature }
        : {}),
      ...(generationTopP !== undefined ? { topP: generationTopP } : {}),
      ...(generationTopK !== undefined ? { topK: generationTopK } : {}),
      ...(generationThinkingBudget !== undefined
        ? { thinkingBudget: generationThinkingBudget }
        : {}),
      maxTokens: generationMaxTokens,
      timeoutMs: 120_000,
    });

    const parsedFromText = extractConfigFromText(raw);
    if (!parsedFromText.parsed) {
      return NextResponse.json(
        {
          error: "Failed to parse AI response",
          validation: {
            isValid: false,
            errors: [
              "No valid agent configuration JSON could be extracted from model output.",
            ],
          },
          warnings: [
            parsedFromText.rawCandidate
              ? "Found a config block but it was malformed."
              : "Model response did not include a parseable config block.",
          ],
        },
        { status: 500 },
      );
    }

    const normalized = normalizeGeneratedAgentConfig(parsedFromText.parsed, {
      fallbackDescription: firstLine(description),
      preserveModel: agentModel,
      preserveEffort:
        effort === "low" || effort === "medium" || effort === "high"
          ? effort
          : undefined,
      preserveTools: selectedTools.length > 0 ? selectedTools : undefined,
    });
    const uniqueName = makeUniqueName(
      normalized.config.name || "unnamed-agent",
      existingAgents,
    );
    const normalizedDescription =
      typeof normalized.config.description === "string" &&
      normalized.config.description.trim()
        ? normalized.config.description
        : firstLine(description);
    const normalizedPrompt =
      typeof normalized.config.prompt === "string" && normalized.config.prompt.trim()
        ? normalized.config.prompt
        : firstLine(description);
    const config = {
      ...normalized.config,
      name: uniqueName,
      description: normalizedDescription,
      prompt: normalizedPrompt,
    };
    const metadata = {
      status: normalized.status,
      warnings: normalized.warnings,
      repairNotes: normalized.repairNotes,
      validation: normalized.validation,
      raw: raw.slice(0, 12_000),
      sourceProvider: provider ?? "default",
    };

    if (targetProvider === "claude") {
      return NextResponse.json({
        ...config,
        ...metadata,
      });
    }

    const results = convertAgentTargets(
      {
        name: config.name,
        description: normalizedDescription,
        prompt: normalizedPrompt,
        model: config.model as string | undefined,
        effort: config.effort as "low" | "medium" | "high" | undefined,
        tools: Array.isArray(config.tools) ? (config.tools as string[]) : undefined,
        color: config.color as string | undefined,
      },
      targetProvider,
    );

    return NextResponse.json({
      targetProvider,
      baseConfig: config,
      primary: results.find((r) => r.target === "claude") ?? results[0] ?? null,
      results,
      ...metadata,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to build agent",
      },
      { status: 500 },
    );
  }
}
