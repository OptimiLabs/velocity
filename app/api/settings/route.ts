import { NextResponse } from "next/server";
import {
  readSettings,
  writeSettings,
  readProjectSettings,
  writeProjectSettings,
} from "@/lib/claude-settings";
import { validateHookConfig } from "@/lib/hooks/validate";
import {
  readCodexSettings,
  writeCodexSettings,
} from "@/lib/codex/settings";
import {
  deepMergeCodexSettings,
  getCodexSettingsMetadata,
} from "@/lib/codex/settings-analysis";
import {
  readGeminiSettings,
  writeGeminiSettings,
} from "@/lib/gemini/settings";
import {
  readAppSettings,
  writeAppSettings,
} from "@/lib/app-settings";

// Provider-specific settings readers/writers — avoids if/else branching
type ProviderSettingsHandler = {
  read: () => Record<string, unknown>;
  write: (data: Record<string, unknown>) => void;
  merge?: (
    current: Record<string, unknown>,
    partial: Record<string, unknown>,
  ) => Record<string, unknown>;
  metadata?: (settings: Record<string, unknown>) => unknown;
};

const PROVIDER_SETTINGS: Record<string, ProviderSettingsHandler> = {
  app: {
    read: readAppSettings as () => Record<string, unknown>,
    write: writeAppSettings as (data: Record<string, unknown>) => void,
  },
  codex: {
    read: readCodexSettings,
    write: writeCodexSettings as (data: Record<string, unknown>) => void,
    merge: deepMergeCodexSettings as (
      current: Record<string, unknown>,
      partial: Record<string, unknown>,
    ) => Record<string, unknown>,
    metadata: getCodexSettingsMetadata as (
      settings: Record<string, unknown>,
    ) => unknown,
  },
  gemini: {
    read: readGeminiSettings,
    write: writeGeminiSettings as (data: Record<string, unknown>) => void,
  },
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const cwd = searchParams.get("cwd");
    const provider = searchParams.get("provider");
    const includeMeta = searchParams.get("includeMeta");

    // Provider-specific settings (e.g. codex)
    if (provider) {
      const providerHandler = PROVIDER_SETTINGS[provider];
      if (!providerHandler) {
        return NextResponse.json(
          { error: `Unknown provider: ${provider}` },
          { status: 400 },
        );
      }
      const settings = providerHandler.read();
      if (includeMeta === "1" || includeMeta === "true") {
        return NextResponse.json({
          provider,
          settings,
          metadata: providerHandler.metadata?.(settings) || {},
        });
      }
      return NextResponse.json(settings);
    }

    if (scope === "project" && cwd) {
      const settings = readProjectSettings(cwd);
      return NextResponse.json(settings);
    }

    const settings = readSettings();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json(
      { error: "Failed to read settings" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    const cwd = searchParams.get("cwd");
    const provider = searchParams.get("provider");

    const rawPartial = (await request.json()) as unknown;
    if (
      !rawPartial ||
      typeof rawPartial !== "object" ||
      Array.isArray(rawPartial)
    ) {
      return NextResponse.json(
        { error: "Invalid settings payload" },
        { status: 400 },
      );
    }
    const partial = rawPartial as Record<string, unknown>;

    // Provider-specific settings (e.g. codex)
    if (provider) {
      const providerHandler = PROVIDER_SETTINGS[provider];
      if (!providerHandler) {
        return NextResponse.json(
          { error: `Unknown provider: ${provider}` },
          { status: 400 },
        );
      }
      const current = providerHandler.read();
      const merged = providerHandler.merge
        ? providerHandler.merge(current, partial)
        : { ...current, ...partial };
      providerHandler.write(merged);
      return NextResponse.json({ success: true });
    }

    const isProject = scope === "project" && cwd;
    const current = isProject ? readProjectSettings(cwd) : readSettings();
    const merged = { ...current, ...partial };

    // Keys that should fully replace (not merge) when explicitly provided
    const replaceKeys = new Set(["mcpServers", "disabledMcpServers", "hooks"]);

    // Deep-merge nested objects (except replace keys which use full replacement)
    const deepMergeKeys = [
      "mcpServers",
      "disabledMcpServers",
      "enabledPlugins",
      "hooks",
      "permissions",
      "env",
      "envProfiles",
    ];
    for (const key of deepMergeKeys) {
      if (
        partial[key] &&
        typeof partial[key] === "object" &&
        !Array.isArray(partial[key])
      ) {
        if (replaceKeys.has(key)) {
          // Full replacement: the partial value is the complete new state
          merged[key] = partial[key];
        } else {
          merged[key] = {
            ...((current[key] as Record<string, unknown>) || {}),
            ...partial[key],
          };
        }
      }
    }

    // Validate hooks only when the request is actually updating hooks
    if (partial.hooks && typeof partial.hooks === "object") {
      const validEvents = new Set([
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "PermissionRequest",
        "Notification",
        "Stop",
        "SubagentStart",
        "SubagentStop",
        "PreCompact",
        "SessionStart",
        "SessionEnd",
        "UserPromptSubmit",
        "TaskCompleted",
        "TeammateIdle",
        "Setup",
        "ConfigChange",
        "WorktreeCreate",
        "WorktreeRemove",
      ]);
      for (const key of Object.keys(partial.hooks as Record<string, unknown>)) {
        if (!validEvents.has(key)) {
          return NextResponse.json(
            { error: `Invalid hook event: ${key}` },
            { status: 400 },
          );
        }
      }

      // Validate each hook with the full validation library (catches field presence,
      // agent-on-high-freq, $FILE/$COMMAND misuse, invalid regex, etc.)
      const hooksObj = partial.hooks as Record<string, unknown[]>;
      for (const [event, rules] of Object.entries(hooksObj)) {
        if (!Array.isArray(rules)) continue;
        for (const rule of rules) {
          const r = rule as { matcher?: string; hooks?: Record<string, unknown>[] };
          if (!r.hooks || !Array.isArray(r.hooks)) continue;
          for (const hook of r.hooks) {
            const validation = validateHookConfig(event, {
              ...hook,
              matcher: r.matcher,
            } as { type: string; command?: string; prompt?: string; matcher?: string; timeout?: number });
            if (!validation.valid) {
              return NextResponse.json(
                { error: `Hook in ${event}: ${validation.errors[0]}` },
                { status: 400 },
              );
            }
          }
        }
      }
    }

    if (isProject) {
      writeProjectSettings(cwd, merged);
    } else {
      writeSettings(merged);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to write settings" },
      { status: 500 },
    );
  }
}
