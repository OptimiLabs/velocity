"use client";

import { useMemo, useState } from "react";
import { ProviderCard } from "./ProviderCard";
import { ProviderDetailSheet } from "./ProviderDetailSheet";
import { useProviders } from "@/hooks/useProviders";
import {
  PROVIDER_CATALOG,
  type ProviderCatalogEntry,
  type ProviderSlug,
} from "@/lib/providers/catalog";
import type { AIProvider } from "@/types/instructions";

type ProviderListItem = Omit<AIProvider, "apiKeyEncrypted">;

export function ProviderGrid() {
  const { data: providers = [] } = useProviders();
  const [selectedSlug, setSelectedSlug] = useState<ProviderSlug | null>(null);

  // Map live provider data by slug for fast lookup
  const liveBySlug = useMemo(() => {
    const map = new Map<string, ProviderListItem>();
    for (const p of providers as ProviderListItem[]) {
      const key = p.providerSlug ?? p.provider;
      map.set(key, p);
    }
    return map;
  }, [providers]);

  const selectedEntry: ProviderCatalogEntry | null =
    PROVIDER_CATALOG.find((e) => e.slug === selectedSlug) ?? null;
  const selectedLiveData = selectedSlug
    ? (liveBySlug.get(selectedSlug) ?? null)
    : null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PROVIDER_CATALOG.map((entry) => (
          <ProviderCard
            key={entry.slug}
            entry={entry}
            connected={liveBySlug.has(entry.slug)}
            onClick={() => setSelectedSlug(entry.slug)}
          />
        ))}
      </div>

      <ProviderDetailSheet
        entry={selectedEntry}
        liveData={selectedLiveData}
        open={!!selectedSlug}
        onOpenChange={(open) => {
          if (!open) setSelectedSlug(null);
        }}
      />
    </>
  );
}
