export interface MarketplaceSource {
  id: string;
  name: string;
  source_type: "github_search" | "github_org" | "github_repo" | "registry";
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

export interface MarketplaceItem {
  name: string;
  description: string;
  type:
    | "skill"
    | "plugin"
    | "mcp-server"
    | "hook"
    | "statusline"
    | "marketplace-plugin"
    | "unclassified"
    | "agent";
  author: string;
  url: string;
  stars?: number;
  updatedAt?: string;
  installed: boolean;
  sourceId: string;
  /** For marketplace-plugin type: "owner/repo" of the marketplace */
  marketplaceRepo?: string;
  /** For marketplace-plugin type: category from marketplace.json */
  category?: string;
  /** Pre-parsed install config (from README discovery) */
  installConfig?: { command: string; args: string[] };
  /** For marketplace-plugin: component counts */
  components?: { agents: number; skills: number; commands: number };
  /** Indicates the repo supports component-level selection */
  componentSelectionSupported?: boolean;
  /** Parsed repo owner/name for stable GitHub routing */
  repo?: { owner: string; name: string };
  /** Default branch discovered from GitHub */
  defaultBranch?: string;
  /** Whether this item is a curated recommended item */
  recommended?: boolean;
  /** For marketplace-plugin: source path from manifest (e.g. "./plugins/foo") */
  sourcePath?: string;
  /** For builtin skills: inline SKILL.md content to install without fetching */
  skillContent?: string;
  /** For hook type: the full hook configuration to install */
  hookConfig?: {
    event: string;
    matcher?: string;
    hook: {
      type: "command" | "prompt" | "agent";
      command?: string;
      prompt?: string;
      timeout?: number;
      async?: boolean;
      statusMessage?: string;
    };
  };
  /** Estimated prompt/context tokens this item contributes when installed/used */
  estimatedTokens?: number;
}

export type ComponentKind = "agent" | "skill" | "command" | "mcp-server";

export interface ComponentDescriptor {
  id: string;
  kind: ComponentKind;
  name: string;
  description?: string;
  primaryPath: string;
  contextDir: string;
  downloadUrl: string;
  githubUrl: string;
  installConfig?: { command: string; args: string[] };
  /** Estimated prompt/context tokens for this component content */
  estimatedTokens?: number;
}

export interface SecuritySignal {
  category:
    | "code-execution"
    | "file-system"
    | "network"
    | "env-vars"
    | "prompt-injection"
    | "permission-escalation";
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  evidence?: string;
}

export interface SecuritySignals {
  overallRisk: "low" | "medium" | "high";
  findings: SecuritySignal[];
  summary: string;
}

export interface PackageDetails {
  repo: { owner: string; name: string; defaultBranch: string };
  components: ComponentDescriptor[];
  readme?: string;
  securitySignals?: SecuritySignals;
  /** Sum of component estimatedTokens */
  estimatedTokensTotal?: number;
}
