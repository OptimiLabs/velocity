import { NextResponse } from "next/server";
import { fullScan } from "@/lib/instructions/indexer";
import { invalidateMarketplaceCache } from "@/app/api/marketplace/search/route";
import { getMarketplaceInstallNameCandidates } from "@/lib/marketplace/install-names";
import {
  findMarketplacePluginEntry,
  removeMarketplacePluginEntry,
  setMarketplacePluginEntryDisabled,
} from "@/lib/marketplace/installed-plugins";
import {
  normalizeTargetProvider,
  setAgentEntryDisabledForProvider,
  setMcpForProviderDisabled,
  setSkillEntryDisabledForProvider,
} from "@/lib/marketplace/plugin-artifacts";

function forEachNameCandidate(
  rawName: string,
  fn: (candidate: string) => boolean,
): boolean {
  let changed = false;
  for (const candidate of getMarketplaceInstallNameCandidates(rawName)) {
    changed = fn(candidate) || changed;
  }
  return changed;
}

export async function POST(request: Request) {
  try {
    const { type, name, enabled, targetProvider, marketplaceRepo } =
      await request.json();
    if (!type || !name) {
      return NextResponse.json(
        { error: "type and name required" },
        { status: 400 },
      );
    }
    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 },
      );
    }
    if (type !== "marketplace-plugin") {
      return NextResponse.json(
        { error: "Only marketplace-plugin supports toggle" },
        { status: 400 },
      );
    }

    const provider = normalizeTargetProvider(targetProvider);
    const resolvedRepo =
      typeof marketplaceRepo === "string" ? marketplaceRepo : undefined;
    const tracked = findMarketplacePluginEntry({
      name,
      targetProvider: provider,
      marketplaceRepo: resolvedRepo,
    });
    if (!tracked) {
      return NextResponse.json(
        { error: "Tracked package artifacts not found" },
        { status: 404 },
      );
    }

    const disabled = !enabled;
    let changed = false;

    for (const agentName of tracked.record.agents) {
      const base = agentName.endsWith(".md")
        ? agentName.slice(0, -3)
        : agentName;
      changed =
        forEachNameCandidate(base, (candidate) =>
          setAgentEntryDisabledForProvider(provider, candidate, disabled),
        ) || changed;
    }

    for (const skillName of [...tracked.record.skills, ...tracked.record.commands]) {
      changed =
        forEachNameCandidate(skillName, (candidate) =>
          setSkillEntryDisabledForProvider(provider, candidate, disabled),
        ) || changed;
    }

    for (const mcpName of tracked.record.mcpServers) {
      changed =
        forEachNameCandidate(mcpName, (candidate) =>
          setMcpForProviderDisabled(provider, candidate, disabled),
        ) || changed;
    }

    if (!changed) {
      removeMarketplacePluginEntry({
        name,
        targetProvider: provider,
        marketplaceRepo: resolvedRepo,
      });
      invalidateMarketplaceCache();
      return NextResponse.json(
        { error: "Tracked package artifacts not found" },
        { status: 404 },
      );
    }

    setMarketplacePluginEntryDisabled({
      name,
      targetProvider: provider,
      marketplaceRepo: resolvedRepo,
      disabled,
    });

    try {
      fullScan();
    } catch {
      // Non-critical.
    }
    invalidateMarketplaceCache();

    return NextResponse.json({
      success: true,
      enabled,
      changed,
    });
  } catch {
    return NextResponse.json({ error: "Toggle failed" }, { status: 500 });
  }
}
