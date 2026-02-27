export function getRuntimeBaseEstimate(provider: string): {
  systemPromptTokens: number;
  systemToolsTokens: number;
  source: "heuristic" | "none";
} {
  // We intentionally avoid hardcoded "system prompt/tool budget" heuristics.
  // These values vary by runtime/model and are not reliably derivable here.
  // The context panel now reports only indexed instruction-file tokens.
  void provider;
  return {
    systemPromptTokens: 0,
    systemToolsTokens: 0,
    source: "none",
  };
}

export function resolveIngestionMode(opts: {
  provider: string;
  fileType: string;
  fileName: string;
}): "always" | "on-demand" {
  const { provider, fileType, fileName } = opts;

  // Runtime default context files.
  if (fileType === "CLAUDE.md") return "always";

  // Codex always loads AGENTS.md / AGENTS.override.md.
  if (
    provider === "codex" &&
    fileType === "agents.md" &&
    /^AGENTS(\.override)?\.md$/i.test(fileName)
  ) {
    return "always";
  }

  // Skills/agents/knowledge libraries are indexed but typically loaded on-demand.
  return "on-demand";
}
