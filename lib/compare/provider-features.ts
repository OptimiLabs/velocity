// Provider feature comparison data (updated Feb 26, 2026)
// Compares CLI tool capabilities across Claude Code, Codex CLI, and Gemini CLI

export interface ProviderFeature {
  name: string;
  description: string;
  claude: boolean | "partial";
  codex: boolean | "partial";
  gemini: boolean | "partial";
}

export interface ProviderFeatureGroup {
  title: string;
  features: ProviderFeature[];
}

export const PROVIDER_FEATURE_GROUPS: ProviderFeatureGroup[] = [
  {
    title: "Dashboard Support",
    features: [
      {
        name: "Session Discovery",
        description: "Automatically discover and list CLI sessions",
        claude: true,
        codex: true,
        gemini: true,
      },
      {
        name: "Session Parsing",
        description: "Parse session logs into structured data",
        claude: true,
        codex: true,
        gemini: true,
      },
      {
        name: "Cost Tracking",
        description: "Track token usage and calculate costs",
        claude: true,
        codex: true,
        gemini: true,
      },
      {
        name: "Cache Cost Tracking",
        description: "Track prompt caching costs separately",
        claude: true,
        codex: false,
        gemini: false,
      },
      {
        name: "Settings Config",
        description: "Read and write provider-specific settings",
        claude: true,
        codex: true,
        gemini: true,
      },
      {
        name: "Instruction Indexing",
        description: "Index and manage instruction files",
        claude: true,
        codex: true,
        gemini: true,
      },
      {
        name: "Analytics Filtering",
        description: "Filter analytics by provider",
        claude: true,
        codex: true,
        gemini: true,
      },
      {
        name: "AI-Powered Editing",
        description: "Use provider's AI for instruction editing",
        claude: true,
        codex: true,
        gemini: true,
      },
    ],
  },
  {
    title: "CLI Tool Features",
    features: [
      {
        name: "MCP Servers",
        description: "Model Context Protocol server support",
        claude: true,
        codex: true,
        gemini: true,
      },
      {
        name: "Custom Skills",
        description: "User-defined reusable skill commands",
        claude: true,
        codex: true,
        gemini: "partial",
      },
      {
        name: "Direct Skill Slash Invocation",
        description: "Invoke custom skills directly as /name",
        claude: true,
        codex: false,
        gemini: false,
      },
      {
        name: "Custom Agents",
        description: "Define custom agent types with tool restrictions",
        claude: true,
        codex: true,
        gemini: "partial",
      },
      {
        name: "Hooks (22 events)",
        description: "Shell commands triggered by tool events",
        claude: true,
        codex: false,
        gemini: "partial",
      },
      {
        name: "Tasks/Teams",
        description: "Multi-agent task coordination and teams",
        claude: true,
        codex: false,
        gemini: false,
      },
      {
        name: "Plan Mode",
        description: "Separate planning phase before implementation",
        claude: true,
        codex: false,
        gemini: false,
      },
      {
        name: "Permissions/Approval",
        description: "Tool-level permission and approval system",
        claude: true,
        codex: true,
        gemini: true,
      },
      {
        name: "Approval Rules DSL",
        description: "Declarative rules for auto-approving tool calls",
        claude: false,
        codex: true,
        gemini: false,
      },
      {
        name: "Web Search",
        description: "Built-in web search capability",
        claude: true,
        codex: true,
        gemini: false,
      },
      {
        name: "Sandbox Mode",
        description: "Isolated execution environment",
        claude: false,
        codex: true,
        gemini: true,
      },
      {
        name: "Reasoning Effort",
        description: "Control model thinking depth",
        claude: true,
        codex: true,
        gemini: false,
      },
      {
        name: "Instruction Files",
        description: "Project and global instruction file support",
        claude: true,
        codex: true,
        gemini: true,
      },
      {
        name: "Marketplace",
        description: "Browse and install community extensions",
        claude: true,
        codex: true,
        gemini: false,
      },
      {
        name: "Worktree Support",
        description: "Git worktree isolation for feature work",
        claude: true,
        codex: false,
        gemini: false,
      },
      {
        name: "Memory Management",
        description: "Persistent cross-session memory",
        claude: true,
        codex: false,
        gemini: false,
      },
      {
        name: "Environment Profiles",
        description: "Named environment variable profiles",
        claude: true,
        codex: false,
        gemini: false,
      },
      {
        name: "Billing/Statusline",
        description: "Live billing and status display",
        claude: true,
        codex: false,
        gemini: false,
      },
      {
        name: "Checkpointing",
        description: "Save and restore session state",
        claude: false,
        codex: false,
        gemini: true,
      },
      {
        name: "Vim Mode",
        description: "Vim keybindings in the CLI",
        claude: false,
        codex: false,
        gemini: true,
      },
      {
        name: "Personality Config",
        description: "Customizable assistant personality",
        claude: false,
        codex: true,
        gemini: false,
      },
    ],
  },
];
