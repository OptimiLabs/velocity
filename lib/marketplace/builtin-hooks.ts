import type { MarketplaceItem } from "@/types/marketplace";
import type { HookRule, RawHooks } from "@/lib/hooks/matcher";
import { estimateTokensFromUnknown } from "@/lib/marketplace/token-estimate";

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

const JSON_PROMPT_SUFFIX =
  '\n\nContext: $ARGUMENTS\n\nYou are a hook evaluator. Your ENTIRE response must be a single JSON object with no other text, no markdown fences, no explanation. Respond: {"ok": true} or {"ok": false, "reason": "explanation"}';

const withPromptJson = (value: string) => `${value.trim()}${JSON_PROMPT_SUFFIX}`;

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
        command: oneLine(`
          if [ -n "$FILE" ] && [ -f "$FILE" ]; then
            if command -v bunx >/dev/null 2>&1; then
              bunx eslint --fix "$FILE";
            elif command -v npx >/dev/null 2>&1; then
              npx eslint --fix "$FILE";
            else
              echo "eslint runner not found";
            fi;
          fi
        `),
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
        command: oneLine(`
          if [ -f bun.lockb ] && command -v bun >/dev/null 2>&1; then
            bun test;
          elif [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then
            pnpm test;
          elif [ -f yarn.lock ] && command -v yarn >/dev/null 2>&1; then
            yarn test;
          elif [ -f package.json ] && command -v npm >/dev/null 2>&1; then
            npm test;
          else
            echo "No supported JS test runner detected";
          fi
        `),
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
        command: oneLine(`
          if [ -n "$FILE" ] && [ -f "$FILE" ]; then
            if command -v bunx >/dev/null 2>&1; then
              bunx prettier --write "$FILE";
            elif command -v npx >/dev/null 2>&1; then
              npx prettier --write "$FILE";
            else
              echo "prettier runner not found";
            fi;
          fi
        `),
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
        command: oneLine(`
          if command -v bunx >/dev/null 2>&1; then
            bunx tsc --noEmit;
          elif command -v npx >/dev/null 2>&1; then
            npx tsc --noEmit;
          else
            echo "tsc runner not found";
          fi
        `),
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
  {
    name: "Bash Safety Review (Prompt)",
    description:
      "Use an LLM guardrail to review shell commands before execution",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/bash-safety-review-prompt",
    installed: false,
    sourceId: "builtin",
    category: "security",
    hookConfig: {
      event: "PreToolUse",
      matcher: "Bash",
      hook: {
        type: "prompt",
        prompt: withPromptJson(
          "Review the pending Bash command for destructive operations, credential leaks, unsafe network calls, or broad filesystem changes. Block only when risk is clear and explain the minimum safe alternative.",
        ),
        timeout: 15,
      },
    },
  },
  {
    name: "Subagent Handoff Check",
    description:
      "Validate subagent output quality before handing control back",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/subagent-handoff-check",
    installed: false,
    sourceId: "builtin",
    category: "quality",
    hookConfig: {
      event: "SubagentStop",
      hook: {
        type: "prompt",
        prompt: withPromptJson(
          "Check that the subagent response includes a concrete outcome, any unresolved risk, and a clear next step. Fail only if the handoff is incomplete or misleading.",
        ),
        timeout: 15,
      },
    },
  },
  {
    name: "Session End Snapshot",
    description: "Capture a lightweight git/session snapshot when a session ends",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/session-end-snapshot",
    installed: false,
    sourceId: "builtin",
    category: "debugging",
    hookConfig: {
      event: "SessionEnd",
      hook: {
        type: "command",
        command: oneLine(`
          mkdir -p .claude/hook-logs;
          {
            echo "=== $(date -u +%FT%TZ) session_end ===";
            git status --short 2>/dev/null || true;
          } >> .claude/hook-logs/session-end.log
        `),
        timeout: 5,
      },
    },
  },
  {
    name: "Config Change Audit Trail",
    description: "Append config-change events to a local audit log",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/config-change-audit",
    installed: false,
    sourceId: "builtin",
    category: "observability",
    hookConfig: {
      event: "ConfigChange",
      hook: {
        type: "command",
        command: oneLine(`
          mkdir -p .claude/hook-logs;
          echo "$(date -u +%FT%TZ) config_change tool=$TOOL_NAME file=$FILE command=$COMMAND" >> .claude/hook-logs/config-change.log
        `),
        timeout: 5,
      },
    },
  },
  {
    name: "Permission Request Audit",
    description:
      "Log interactive permission requests for traceability (conditional event)",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/permission-request-audit",
    installed: false,
    sourceId: "builtin",
    category: "observability",
    hookConfig: {
      event: "PermissionRequest",
      matcher: "Bash|Edit|Write|Read",
      hook: {
        type: "command",
        command: oneLine(`
          mkdir -p .claude/hook-logs;
          echo "$(date -u +%FT%TZ) permission_request tool=$TOOL_NAME file=$FILE command=$COMMAND args=$ARGUMENTS" >> .claude/hook-logs/permission-request.log
        `),
        timeout: 5,
      },
    },
  },
  {
    name: "Worktree Bootstrap Note",
    description:
      "Record a note whenever Claude creates a worktree (conditional event)",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/worktree-bootstrap-note",
    installed: false,
    sourceId: "builtin",
    category: "automation",
    hookConfig: {
      event: "WorktreeCreate",
      hook: {
        type: "command",
        command: oneLine(`
          mkdir -p .claude/hook-logs;
          echo "$(date -u +%FT%TZ) worktree_create cwd=$(pwd)" >> .claude/hook-logs/worktree.log
        `),
        timeout: 5,
      },
    },
  },
  {
    name: "Worktree Removal Note",
    description:
      "Record a note whenever Claude removes a worktree (conditional event)",
    type: "hook",
    author: "velocity",
    url: "builtin://hooks/worktree-removal-note",
    installed: false,
    sourceId: "builtin",
    category: "automation",
    hookConfig: {
      event: "WorktreeRemove",
      hook: {
        type: "command",
        command: oneLine(`
          mkdir -p .claude/hook-logs;
          echo "$(date -u +%FT%TZ) worktree_remove cwd=$(pwd)" >> .claude/hook-logs/worktree.log
        `),
        timeout: 5,
      },
    },
  },
];

/** Curated subset of templates for inline display in HookEditor */
const INLINE_TEMPLATE_URLS = [
  "builtin://hooks/lint-on-edit",
  "builtin://hooks/auto-format",
  "builtin://hooks/test-before-stop",
  "builtin://hooks/bash-safety-review-prompt",
  "builtin://hooks/typecheck-on-edit",
  "builtin://hooks/guard-force-push",
  "builtin://hooks/prevent-deletions",
  "builtin://hooks/session-end-snapshot",
] as const;

export const INLINE_TEMPLATES: MarketplaceItem[] = INLINE_TEMPLATE_URLS.flatMap(
  (url) => BUILTIN_HOOK_TEMPLATES.find((tpl) => tpl.url === url) || [],
);

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
