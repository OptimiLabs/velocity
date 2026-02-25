import { extractFirstJsonObject } from "@/lib/ai/parse";
import type { Agent } from "@/types/agent";

const ALLOWED_MODELS = new Set(["opus", "sonnet", "haiku"]);
const ALLOWED_EFFORTS = new Set(["low", "medium", "high"]);

const COLOR_MAP: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  violet: "#7c3aed",
  purple: "#7c3aed",
  pink: "#ec4899",
  cyan: "#06b6d4",
  teal: "#14b8a6",
};

const DEFAULT_TOOLS = ["Read", "Glob", "Grep"] as const;

export interface AgentConfigValidation {
  isValid: boolean;
  errors: string[];
}

export type AgentConfigStatus = "empty" | "valid" | "repaired" | "invalid";

export interface NormalizedAgentConfigResult {
  config: Partial<Agent>;
  status: AgentConfigStatus;
  warnings: string[];
  repairNotes: string[];
  validation: AgentConfigValidation;
}

interface NormalizeOptions {
  fallbackName?: string;
  fallbackDescription?: string;
  preserveModel?: string;
  preserveEffort?: "low" | "medium" | "high";
  preserveTools?: string[];
}

function firstLine(value: string, max = 200): string {
  return value.trim().split(/\r?\n/, 1)[0].slice(0, max);
}

function sanitizeAgentName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const kebab = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return kebab || undefined;
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

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return trimmed;
  return undefined;
}

function normalizeModel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const model = value.trim().toLowerCase();
  return ALLOWED_MODELS.has(model) ? model : undefined;
}

function normalizeEffort(value: unknown): "low" | "medium" | "high" | undefined {
  if (typeof value !== "string") return undefined;
  const effort = value.trim().toLowerCase();
  return ALLOWED_EFFORTS.has(effort)
    ? (effort as "low" | "medium" | "high")
    : undefined;
}

function tryParseJsonLoose(input: string): Record<string, unknown> | null {
  const attempts = [
    input.trim(),
    input.trim().replace(/,\s*([}\]])/g, "$1"),
  ];
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next strategy
    }
  }
  return null;
}

export function extractLastAgentConfigFence(text: string): string | null {
  const regex = /```agent-config\s*\r?\n([\s\S]*?)```/gi;
  let last: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    last = match[1] ?? null;
  }
  return last;
}

export function extractConfigFromText(text: string): {
  parsed: Record<string, unknown> | null;
  rawCandidate: string | null;
  source: "fenced" | "json" | "none";
} {
  const fenced = extractLastAgentConfigFence(text);
  if (fenced) {
    const parsed = tryParseJsonLoose(fenced);
    if (parsed) {
      return { parsed, rawCandidate: fenced, source: "fenced" };
    }
  }

  const jsonCandidate = extractFirstJsonObject(text);
  if (jsonCandidate) {
    const parsed = tryParseJsonLoose(jsonCandidate);
    if (parsed) {
      return { parsed, rawCandidate: jsonCandidate, source: "json" };
    }
  }

  return { parsed: null, rawCandidate: fenced ?? null, source: "none" };
}

export function normalizeGeneratedAgentConfig(
  generated: unknown,
  options: NormalizeOptions = {},
): NormalizedAgentConfigResult {
  const warnings: string[] = [];
  const repairNotes: string[] = [];
  const errors: string[] = [];

  const source =
    generated && typeof generated === "object" && !Array.isArray(generated)
      ? (generated as Record<string, unknown>)
      : {};

  const fallbackDescription = firstLine(
    options.fallbackDescription?.trim() || "Generated agent",
  );
  const fallbackName = options.fallbackName || sanitizeAgentName(fallbackDescription) || "unnamed-agent";

  const parsedName = sanitizeAgentName(source.name);
  const name = parsedName || fallbackName;
  if (!parsedName) {
    repairNotes.push("Normalized name to kebab-case.");
  }

  const parsedDescription =
    typeof source.description === "string"
      ? firstLine(source.description)
      : "";
  const description = parsedDescription || fallbackDescription;
  if (!parsedDescription) {
    repairNotes.push("Filled missing description from request.");
  }

  const parsedPrompt =
    typeof source.prompt === "string" ? source.prompt.trim() : "";
  const prompt = parsedPrompt || description;
  if (!parsedPrompt) {
    repairNotes.push("Filled missing prompt from description.");
  }

  const parsedModel = normalizeModel(source.model);
  if (source.model && !parsedModel) {
    warnings.push("Model was invalid and reset to default.");
  }

  const parsedEffort = normalizeEffort(source.effort);
  if (source.effort && !parsedEffort) {
    warnings.push("Effort was invalid and reset to default.");
  }

  const parsedTools = normalizeTools(source.tools);
  const selectedTools =
    options.preserveTools && options.preserveTools.length > 0
      ? options.preserveTools
      : parsedTools.length > 0
        ? parsedTools
        : [...DEFAULT_TOOLS];
  if (parsedTools.length === 0 && !(options.preserveTools && options.preserveTools.length > 0)) {
    repairNotes.push("Applied default tools because none were provided.");
  }

  const parsedColor = normalizeColor(source.color);
  const color = parsedColor || "#3b82f6";
  if (source.color && !parsedColor) {
    repairNotes.push("Normalized invalid color to default blue.");
  }

  const model = options.preserveModel || parsedModel;
  const effort = options.preserveEffort || parsedEffort;

  const config: Partial<Agent> = {
    name,
    description,
    prompt,
    tools: selectedTools,
    color,
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  };

  if (!config.name?.trim()) errors.push("Missing required field: name");
  if (!config.prompt?.trim()) errors.push("Missing required field: prompt");

  const isValid = errors.length === 0;
  const hadRepairs = repairNotes.length > 0 || warnings.length > 0;

  return {
    config,
    status: isValid ? (hadRepairs ? "repaired" : "valid") : "invalid",
    warnings,
    repairNotes,
    validation: {
      isValid,
      errors,
    },
  };
}
