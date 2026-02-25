import type { MarketplaceItem } from "@/types/marketplace";
import type { HookRule, RawHooks } from "@/lib/hooks/matcher";
import { estimateTokensFromUnknown } from "@/lib/marketplace/token-estimate";

/**
 * Built-in hook templates surfaced in the marketplace.
 * Each template carries a full `hookConfig` so it can be installed
 * directly into settings.hooks without further configuration.
 */
export const BUILTIN_HOOK_TEMPLATES: MarketplaceItem[] = [
  {
    name: "Lint on Edit",
    description: "Run ESLint after file edits to catch issues immediately",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/lint-on-edit",
    installed: false,
    sourceId: "builtin",
    category: "quality",
    hookConfig: {
      event: "PostToolUse",
      matcher: "Edit|Write",
      hook: {
        type: "command",
        command: 'npx eslint --fix "$FILE"',
        timeout: 10,
      },
    },
  },
  {
    name: "Run Tests Before Stop",
    description: "Run the test suite before Claude ends the session",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/test-before-stop",
    installed: false,
    sourceId: "builtin",
    category: "quality",
    hookConfig: {
      event: "Stop",
      hook: {
        type: "command",
        command: "bun test --run 2>&1 | tail -5",
        timeout: 30,
      },
    },
  },
  {
    name: "Validate Bash Commands",
    description: "Review potentially dangerous shell commands before execution",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/validate-bash",
    installed: false,
    sourceId: "builtin",
    category: "security",
    hookConfig: {
      event: "PreToolUse",
      matcher: "Bash",
      hook: {
        type: "command",
        command: 'echo "Reviewing: $COMMAND"',
        timeout: 5,
      },
    },
  },
  {
    name: "Session Startup Script",
    description: "Run a setup script when new sessions start",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/session-startup",
    installed: false,
    sourceId: "builtin",
    category: "automation",
    hookConfig: {
      event: "SessionStart",
      hook: {
        type: "command",
        command: 'echo "Session started at $(date)"',
        timeout: 5,
      },
    },
  },
  {
    name: "Auto-Format on Save",
    description: "Run Prettier after file writes for consistent formatting",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/auto-format",
    installed: false,
    sourceId: "builtin",
    category: "quality",
    hookConfig: {
      event: "PostToolUse",
      matcher: "Write",
      hook: {
        type: "command",
        command: 'npx prettier --write "$FILE"',
        timeout: 10,
      },
    },
  },
  {
    name: "Auto-Rename Session",
    description:
      "Generate a concise session name from your first prompt using the Claude CLI",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/auto-rename-session",
    installed: false,
    sourceId: "builtin",
    category: "automation",
    hookConfig: {
      event: "UserPromptSubmit",
      hook: {
        type: "command",
        command:
          'PROMPT=$(jq -r \'.prompt\') && claude --print "Summarize this in 3-5 words as a session title. Output ONLY the title: $PROMPT"',
        timeout: 15,
      },
    },
  },
  {
    name: "Compact Context Summary",
    description: "Log a summary when context is compacted for debugging",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/compact-summary",
    installed: false,
    sourceId: "builtin",
    category: "debugging",
    hookConfig: {
      event: "PreCompact",
      hook: {
        type: "command",
        command: 'echo "[$(date)] Context compacting" >> ~/.claude/compact.log',
        timeout: 5,
      },
    },
  },
  {
    name: "Type-check on Edit",
    description: "Run TypeScript type-checker after file edits",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/typecheck-on-edit",
    installed: false,
    sourceId: "builtin",
    category: "quality",
    hookConfig: {
      event: "PostToolUse",
      matcher: "Edit|Write",
      hook: {
        type: "command",
        command: "npx tsc --noEmit 2>&1 | tail -5",
        timeout: 30,
      },
    },
  },
  {
    name: "Guard Force Push",
    description: "Block git push --force and other destructive git operations",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/guard-force-push",
    installed: false,
    sourceId: "builtin",
    category: "security",
    hookConfig: {
      event: "PreToolUse",
      matcher: "Bash",
      hook: {
        type: "command",
        command:
          'if echo "$COMMAND" | grep -qE "git\\s+(push\\s+--force|push\\s+-f|reset\\s+--hard|clean\\s+-f)"; then echo "BLOCKED: destructive git operation" >&2; exit 1; fi',
        timeout: 5,
      },
    },
  },
  {
    name: "Prevent Dangerous Deletions",
    description: "Block rm -rf and other mass-deletion commands",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/prevent-deletions",
    installed: false,
    sourceId: "builtin",
    category: "security",
    hookConfig: {
      event: "PreToolUse",
      matcher: "Bash",
      hook: {
        type: "command",
        command:
          'if echo "$COMMAND" | grep -qE "rm\\s+(-rf|-fr|--recursive)\\s+(/|~|\\$HOME)"; then echo "BLOCKED: dangerous deletion" >&2; exit 1; fi',
        timeout: 5,
      },
    },
  },
];

/** Curated subset of templates for inline display in HookEditor */
export const INLINE_TEMPLATES: MarketplaceItem[] = [
  BUILTIN_HOOK_TEMPLATES[0],  // Lint on Edit
  BUILTIN_HOOK_TEMPLATES[4],  // Auto-Format on Save
  BUILTIN_HOOK_TEMPLATES[1],  // Run Tests Before Stop
  BUILTIN_HOOK_TEMPLATES[2],  // Validate Bash Commands
  BUILTIN_HOOK_TEMPLATES[7],  // Type-check on Edit
  BUILTIN_HOOK_TEMPLATES[8],  // Guard Force Push
];

/**
 * Check if a specific hook template is already installed in the current settings.
 * Performs a deep comparison of the hook config against all rules for the target event.
 */
export function isHookInstalled(
  hooks: RawHooks | undefined,
  template: MarketplaceItem,
): boolean {
  if (!hooks || !template.hookConfig) return false;

  const { event, matcher, hook: templateHook } = template.hookConfig;
  const eventRules: HookRule[] = hooks[event] || [];

  return eventRules.some((rule) => {
    // Matcher must match (both undefined counts as match)
    const ruleMatcherNorm = rule.matcher ?? undefined;
    const tplMatcherNorm = matcher ?? undefined;
    if (ruleMatcherNorm !== tplMatcherNorm) return false;

    // At least one hook in the rule must match the template hook
    return rule.hooks.some((h) => {
      if (h.type !== templateHook.type) return false;
      if (templateHook.type === "command") {
        return h.command === templateHook.command;
      }
      return h.prompt === templateHook.prompt;
    });
  });
}

/**
 * Return builtin hook templates filtered by search query and type,
 * with `installed` status resolved against current settings.
 */
export function getBuiltinHookItems(
  query: string,
  typeFilter: string,
  hooks?: RawHooks,
): MarketplaceItem[] {
  if (typeFilter && typeFilter !== "hook") return [];

  const q = query.toLowerCase();
  return BUILTIN_HOOK_TEMPLATES.filter((tpl) => {
    if (!q) return true;
    return (
      tpl.name.toLowerCase().includes(q) ||
      tpl.description.toLowerCase().includes(q) ||
      (tpl.category || "").toLowerCase().includes(q)
    );
  }).map((tpl) => ({
    ...tpl,
    installed: isHookInstalled(hooks, tpl),
    estimatedTokens: estimateTokensFromUnknown({
      event: tpl.hookConfig?.event,
      matcher: tpl.hookConfig?.matcher,
      hook: tpl.hookConfig?.hook,
    }),
  }));
}
