import type { ConfigProvider } from "@/types/provider";
import type { ArtifactType } from "@/types/provider-artifacts";
import { getProviderFs } from "@/lib/providers/filesystem-registry";

export interface ProviderArtifactCapability {
  provider: ConfigProvider;
  artifact: ArtifactType;
  previewSupported: boolean;
  saveSupported: boolean;
  reason?: string;
}

export function getProviderArtifactCapability(
  provider: ConfigProvider,
  artifact: ArtifactType,
): ProviderArtifactCapability {
  const fsDef = getProviderFs(provider);

  if (artifact === "instruction") {
    return {
      provider,
      artifact,
      previewSupported: true,
      saveSupported: true,
    };
  }

  if (artifact === "skill") {
    return {
      provider,
      artifact,
      previewSupported: true,
      saveSupported: fsDef.supportsSkills,
      ...(fsDef.supportsSkills
        ? {}
        : { reason: `${provider} does not currently support persisted skills in this app` }),
    };
  }

  if (artifact === "agent") {
    return {
      provider,
      artifact,
      previewSupported: true,
      saveSupported: fsDef.supportsAgents,
      ...(fsDef.supportsAgents
        ? {}
        : { reason: `${provider} does not currently support persisted agents in this app` }),
    };
  }

  return {
    provider,
    artifact,
    previewSupported: true,
    saveSupported: fsDef.supportsHooks,
    ...(fsDef.supportsHooks
      ? {}
      : { reason: `${provider} hooks are not supported in this app` }),
  };
}

