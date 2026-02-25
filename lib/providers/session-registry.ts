import type { ConfigProvider } from "@/types/provider";

export interface SessionProviderDef {
  readonly id: ConfigProvider;
  readonly label: string;
  readonly chartColor: string;
  readonly badgeClasses: { bg: string; text: string; border: string };
  readonly modelPrefixes: string[];
}

const registry = new Map<string, SessionProviderDef>();

function register(def: SessionProviderDef) {
  registry.set(def.id, def);
}

register({
  id: "claude",
  label: "Claude",
  chartColor: "hsl(24, 95%, 53%)",
  badgeClasses: {
    bg: "bg-orange-500/10",
    text: "text-orange-600",
    border: "border-orange-500/30",
  },
  modelPrefixes: ["claude-"],
});

register({
  id: "codex",
  label: "Codex",
  chartColor: "hsl(160, 60%, 45%)",
  badgeClasses: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600",
    border: "border-emerald-500/30",
  },
  modelPrefixes: ["o1", "o3", "o4", "gpt-3", "gpt-4", "gpt-5", "codex-mini"],
});

register({
  id: "gemini",
  label: "Gemini",
  chartColor: "hsl(217, 91%, 60%)",
  badgeClasses: {
    bg: "bg-blue-500/10",
    text: "text-blue-600",
    border: "border-blue-500/30",
  },
  modelPrefixes: ["gemini-"],
});

export function getSessionProvider(id: string): SessionProviderDef | undefined {
  return registry.get(id);
}

export function requireSessionProvider(id: string): SessionProviderDef {
  const def = registry.get(id);
  if (!def) throw new Error(`Unknown session provider: ${id}`);
  return def;
}

export function getAllSessionProviders(): SessionProviderDef[] {
  return [...registry.values()];
}

export function detectSessionProvider(
  modelUsage: Record<string, unknown>,
): ConfigProvider {
  const models = Object.keys(modelUsage);
  for (const def of registry.values()) {
    if (def.id === "claude") continue; // claude is the default fallback
    if (models.some((m) => def.modelPrefixes.some((p) => m.startsWith(p)))) {
      return def.id;
    }
  }
  return "claude";
}
