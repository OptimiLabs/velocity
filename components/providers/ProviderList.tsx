"use client";

import { useMemo } from "react";
import { ProviderListRow } from "./ProviderListRow";
import { useProviders } from "@/hooks/useProviders";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog";
import type { AIProvider } from "@/types/instructions";

type ProviderListItem = Omit<AIProvider, "apiKeyEncrypted">;

export function ProviderList() {
  const { data: providers = [] } = useProviders();

  const liveBySlug = useMemo(() => {
    const map = new Map<string, ProviderListItem>();
    for (const p of providers as ProviderListItem[]) {
      const key = p.providerSlug ?? p.provider;
      map.set(key, p);
    }
    return map;
  }, [providers]);

  return (
    <div className="space-y-2">
      {PROVIDER_CATALOG.map((entry) => (
        <ProviderListRow
          key={entry.slug}
          entry={entry}
          liveData={liveBySlug.get(entry.slug) ?? null}
        />
      ))}
    </div>
  );
}
