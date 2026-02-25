import type { ConfigProvider } from "@/types/provider";

export type CommandHandler = "client" | "server" | "navigation" | "dialog";
export type CommandCategory =
  | "session"
  | "config"
  | "info"
  | "tools"
  | "navigation";

export interface CommandDef {
  name: string;
  description: string;
  details?: string; // Extended description shown in detail panel
  category: CommandCategory;
  handler: CommandHandler;
  route?: string; // for 'navigation' handlers
  shortcut?: string; // keyboard shortcut hint
  event?: string; // custom event name to dispatch (for modal triggers)
  providers?: ConfigProvider[]; // Optional provider allow-list (default: all providers)
}

export const COMMAND_REGISTRY: CommandDef[] = [
  // Session commands
  {
    name: "clear",
    description: "Clear console output",
    details:
      "Clears all visible output from the current console pane. The underlying session history is preserved — this only affects the display. Useful when the console feels cluttered or you want a fresh visual start.",
    category: "session",
    handler: "client",
    shortcut: "⌘K",
  },
  {
    name: "compact",
    description: "Compact conversation context",
    details:
      "Asks the active assistant to summarize the conversation so far and replace the full history with a condensed version. This frees up context window space, letting you continue longer sessions without hitting token limits. Best used when the conversation has accumulated a lot of back-and-forth that can be summarized.",
    category: "session",
    handler: "server",
  },
  {
    name: "copy",
    description: "Copy last response to clipboard",
    details:
      "Copies Claude's most recent response text to your system clipboard. Handy for pasting code snippets, explanations, or outputs into other applications without manually selecting text.",
    category: "session",
    handler: "client",
  },
  {
    name: "export",
    description: "Export conversation as markdown",
    details:
      "Exports the entire conversation history as a formatted Markdown file. Includes all messages, code blocks, and tool outputs. Useful for documentation, sharing with teammates, or archiving important sessions.",
    category: "session",
    handler: "client",
  },
  {
    name: "rename",
    description: "Rename current session",
    details:
      "Changes the display name of the current session. Session names appear in the sidebar and session history, making it easier to find and resume specific conversations later.",
    category: "session",
    handler: "client",
  },
  {
    name: "resume",
    description: "Resume a previous session",
    details:
      "Opens a dialog to browse and resume a previous session. Claude will reload the conversation context so you can continue where you left off. Sessions are listed by name and date.",
    category: "session",
    handler: "dialog",
  },
  {
    name: "plan",
    description: "Toggle plan mode",
    details:
      "Switches Claude into plan mode, where it will research and design an approach before writing code. In plan mode, Claude explores the codebase, identifies relevant files, and presents a step-by-step implementation plan for your approval before making any changes.",
    category: "session",
    handler: "server",
  },
  {
    name: "pin",
    description: "Pin last response as session plan (/pin clear to unpin)",
    details:
      "Pins Claude's last response to the top of the console as a persistent reference. Useful for keeping a plan, checklist, or important output visible while you work. Use /pin clear to remove the pinned content.",
    category: "session",
    handler: "client",
  },
  {
    name: "exit",
    description: "End current session",
    details:
      "Gracefully ends the current assistant session. The session history is saved and can be resumed later with /resume. Any running background tasks will be stopped.",
    category: "session",
    handler: "client",
  },
  // Tools commands
  {
    name: "workflow",
    description: "Launch a workflow",
    details:
      "Opens a picker to select and launch a saved workflow. Workflows are multi-step automated sequences that chain together commands, prompts, and actions. You can create workflows from the Workflows page.",
    category: "tools",
    handler: "client",
  },
  {
    name: "agent",
    description: "Launch an agent session",
    details:
      "Opens a picker to select and launch a configured agent. Agents are pre-configured assistant sessions with specific system prompts, tools, and behaviors tailored for particular tasks like code review, debugging, or documentation.",
    category: "tools",
    handler: "client",
  },

  // Config commands
  {
    name: "config",
    description: "Open settings",
    details:
      "Navigates to the Settings page where you can configure model providers, permissions, hooks, MCP servers, and other application preferences.",
    category: "config",
    handler: "navigation",
    route: "/settings",
  },
  {
    name: "model",
    description: "Show or change model",
    details:
      "Opens a dialog to view the current model and switch to a different one. Available models depend on your configured providers. Changes take effect for the current session immediately.",
    category: "config",
    handler: "dialog",
    shortcut: "⌘⇧M",
  },
  {
    name: "hooks",
    description: "Manage hooks",
    details:
      "Navigates to the Hooks settings tab. Hooks are shell commands that run automatically in response to events like session start, tool calls, or notifications.",
    category: "config",
    handler: "navigation",
    route: "/settings?tab=hooks",
    providers: ["claude"],
  },
  {
    name: "add-hook",
    description: "Quick add a hook",
    details:
      "Navigates directly to the hook creation form. A shortcut for /hooks that skips straight to adding a new hook rather than browsing existing ones.",
    category: "config",
    handler: "navigation",
    route: "/settings?tab=hooks&action=new-hook",
    providers: ["claude"],
  },
  {
    name: "permissions",
    description: "Manage permissions",
    details:
      "Navigates to the Permissions settings tab. Configure which tools Claude can use automatically vs. which require your approval. Set up allow/deny rules for file access, command execution, and other sensitive operations.",
    category: "config",
    handler: "navigation",
    route: "/settings?tab=permissions",
  },
  {
    name: "mcp",
    description: "Manage MCP servers",
    details:
      "Navigates to the MCP Servers page. View, add, and configure Model Context Protocol servers used by the active provider.",
    category: "config",
    handler: "navigation",
    route: "/mcp",
  },
  {
    name: "memory",
    description: "Edit instruction entrypoint file",
    details:
      "Opens the provider instruction file editor. The entrypoint instruction file is loaded at the start of each session and contains persistent conventions, coding standards, and workflow guidance.",
    category: "config",
    handler: "navigation",
    route: "/skills",
  },
  {
    name: "init",
    description: "Initialize instruction entrypoint in project",
    details:
      "Initializes the provider entrypoint instruction file in your project root with sensible defaults so future sessions start with project-specific guidance.",
    category: "config",
    handler: "server",
  },
  {
    name: "theme",
    description: "Toggle dark/light mode",
    details:
      "Opens a theme picker to switch between dark and light mode. Your preference is saved and persists across sessions.",
    category: "config",
    handler: "dialog",
  },

  // Info commands
  {
    name: "help",
    description: "Show available commands",
    details:
      "Displays a quick reference of all available slash commands grouped by category. Shows command names and short descriptions inline in the console.",
    category: "info",
    handler: "client",
    shortcut: "?",
  },
  {
    name: "status",
    description: "Show session info",
    details:
      "Displays current session metadata including session ID, model in use, working directory, active hooks, and connection status. Useful for debugging or confirming your session configuration.",
    category: "info",
    handler: "client",
  },
  {
    name: "cost",
    description: "Show session cost breakdown",
    details:
      "Shows a detailed breakdown of API costs for the current session — input tokens, output tokens, cache reads/writes, and total cost. Helps you monitor spending and understand which interactions are most expensive.",
    category: "info",
    handler: "client",
  },
  {
    name: "context",
    description: "Show token usage breakdown",
    details:
      "Displays how much of Claude's context window is currently in use, broken down by conversation history, system prompts, tool results, and other components. Helps you decide when to /compact.",
    category: "info",
    handler: "client",
  },
  {
    name: "doctor",
    description: "Run health diagnostics",
    details:
      "Runs a series of diagnostic checks on your setup — API key validity, model availability, MCP server connectivity, file permissions, and more. Outputs a report highlighting any issues found.",
    category: "info",
    handler: "server",
  },
  {
    name: "tasks",
    description: "Show background tasks",
    details:
      "Lists all background tasks spawned during the current session, including subagents, long-running shell commands, and file watchers. Shows their status (running, completed, failed) and lets you inspect outputs.",
    category: "info",
    handler: "client",
  },
  {
    name: "todos",
    description: "Show todo items",
    details:
      "Displays the current task list that Claude is tracking for this session. Shows each todo's status (pending, in progress, completed) and description. Useful for reviewing progress on multi-step tasks.",
    category: "info",
    handler: "client",
  },

  // Navigation commands
  {
    name: "plugin",
    description: "Browse plugins & tools",
    details:
      "Navigates to the Library page showing installed plugins and available tools. Browse, enable, disable, and configure plugins.",
    category: "navigation",
    handler: "navigation",
    route: "/mcp",
    providers: ["claude"],
  },
  {
    name: "marketplace",
    description: "Browse marketplace",
    details:
      "Navigates to the Marketplace page where you can discover and install community-created plugins, hooks, skills, and MCP servers. Items are searchable and organized by category.",
    category: "navigation",
    handler: "navigation",
    route: "/marketplace",
  },
  {
    name: "agents",
    description: "Manage agents",
    details:
      "Navigates to the Agents page where you can create, edit, and launch agent configurations. Agents are reusable Claude setups with custom system prompts, tool access, and specialized behaviors.",
    category: "navigation",
    handler: "navigation",
    route: "/agents",
  },
  {
    name: "stats",
    description: "View usage statistics",
    details:
      "Navigates to the Usage page showing API usage analytics — cost over time, tokens consumed, sessions run, and model distribution charts. Helps track spending and usage patterns.",
    category: "navigation",
    handler: "navigation",
    route: "/usage",
  },
];

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  session: "Session",
  config: "Configuration",
  info: "Information",
  tools: "Tools",
  navigation: "Navigation",
};

/** Simple fuzzy match — checks if all chars in query appear in order in target */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Group commands by category, filtered by query */
export function getGroupedCommands(
  query: string,
  extraCommands?: CommandDef[],
): { category: CommandCategory; label: string; commands: CommandDef[] }[] {
  const all = [...COMMAND_REGISTRY, ...(extraCommands || [])];
  const filtered = query
    ? all.filter(
        (c) => fuzzyMatch(query, c.name) || fuzzyMatch(query, c.description),
      )
    : all;

  const groups: {
    category: CommandCategory;
    label: string;
    commands: CommandDef[];
  }[] = [];
  const order: CommandCategory[] = [
    "session",
    "config",
    "info",
    "navigation",
    "tools",
  ];

  for (const cat of order) {
    const cmds = filtered.filter((c) => c.category === cat);
    if (cmds.length > 0) {
      groups.push({
        category: cat,
        label: CATEGORY_LABELS[cat],
        commands: cmds,
      });
    }
  }
  return groups;
}

function supportsProvider(command: CommandDef, provider: ConfigProvider): boolean {
  if (!command.providers || command.providers.length === 0) return true;
  return command.providers.includes(provider);
}

const PROVIDER_LABEL: Record<ConfigProvider, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

const PROVIDER_ENTRYPOINT_FILE: Record<ConfigProvider, string> = {
  claude: "CLAUDE.md",
  codex: "AGENTS.md",
  gemini: "GEMINI.md",
};

function localizeCommandCopy(
  command: CommandDef,
  provider: ConfigProvider,
): CommandDef {
  const providerLabel = PROVIDER_LABEL[provider];
  const localizedBase: CommandDef = {
    ...command,
    description:
      provider === "claude"
        ? command.description
        : command.description.replace(/\bClaude\b/g, providerLabel),
    details:
      provider === "claude" || !command.details
        ? command.details
        : command.details.replace(/\bClaude\b/g, providerLabel),
  };

  if (command.name === "memory") {
    const fileName = PROVIDER_ENTRYPOINT_FILE[provider];
    return {
      ...localizedBase,
      description: `Edit ${fileName} instructions`,
      details: `Opens the ${fileName} instruction file editor for ${providerLabel}. ${fileName} contains persistent instructions loaded at session start — project conventions, coding standards, and custom guidelines.`,
    };
  }

  if (command.name === "init") {
    const fileName = PROVIDER_ENTRYPOINT_FILE[provider];
    return {
      ...localizedBase,
      description: `Initialize ${fileName} in project`,
      details: `Creates a new ${fileName} file in your project root with sensible defaults for ${providerLabel} sessions.`,
    };
  }

  return localizedBase;
}

/** Get commands grouped by category for a specific provider */
export function getCommandsForProvider(
  provider: ConfigProvider,
  query?: string,
): { category: CommandCategory; label: string; commands: CommandDef[] }[] {
  const scopedCommands = COMMAND_REGISTRY
    .filter((command) => supportsProvider(command, provider))
    .map((command) => localizeCommandCopy(command, provider));

  const filtered = query
    ? scopedCommands.filter(
        (c) => fuzzyMatch(query, c.name) || fuzzyMatch(query, c.description),
      )
    : scopedCommands;

  const groups: {
    category: CommandCategory;
    label: string;
    commands: CommandDef[];
  }[] = [];
  const order: CommandCategory[] = [
    "session",
    "config",
    "info",
    "navigation",
    "tools",
  ];

  for (const cat of order) {
    const cmds = filtered.filter((c) => c.category === cat);
    if (cmds.length > 0) {
      groups.push({
        category: cat,
        label: CATEGORY_LABELS[cat],
        commands: cmds,
      });
    }
  }

  return groups;
}
