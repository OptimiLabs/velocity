"use client";

import { PROVIDER_COLORS } from "@/lib/compare/landscape";
import {
  PROVIDER_FEATURE_GROUPS,
  type ProviderFeature,
} from "@/lib/compare/provider-features";
import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-react";

type ProviderKey = "claude" | "codex" | "gemini";

const PROVIDERS: {
  key: ProviderKey;
  label: string;
  colorKey: keyof typeof PROVIDER_COLORS;
}[] = [
  { key: "claude", label: "Claude Code", colorKey: "anthropic" },
  { key: "codex", label: "Codex CLI", colorKey: "openai" },
  { key: "gemini", label: "Gemini CLI", colorKey: "google" },
];

function SupportIcon({ value }: { value: boolean | "partial" }) {
  if (value === true) {
    return <Check size={14} className="text-green-500" />;
  }
  if (value === "partial") {
    return <Check size={14} className="text-yellow-500" />;
  }
  return <Minus size={14} className="text-muted-foreground/40" />;
}

function FeatureRow({ feature }: { feature: ProviderFeature }) {
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-2.5 px-4">
        <div className="font-medium text-xs">{feature.name}</div>
        <div className="text-micro text-muted-foreground mt-0.5">
          {feature.description}
        </div>
      </td>
      {PROVIDERS.map((p) => (
        <td key={p.key} className="py-2.5 px-4 text-center">
          <span className="inline-flex justify-center">
            <SupportIcon value={feature[p.key]} />
          </span>
        </td>
      ))}
    </tr>
  );
}

export function ProviderFeatureMatrix() {
  return (
    <div className="overflow-x-auto">
      <table className="table-readable w-full text-xs">
        <thead>
          <tr className="border-b border-border/40">
            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
              Feature
            </th>
            {PROVIDERS.map((p) => {
              const colors = PROVIDER_COLORS[p.colorKey];
              return (
                <th
                  key={p.key}
                  className="py-2.5 px-4 font-medium text-center whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-2 rounded-full border",
                        colors.bg,
                        colors.border,
                      )}
                    />
                    <span className="text-muted-foreground">{p.label}</span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {PROVIDER_FEATURE_GROUPS.map((group) => (
            <Group key={group.title} title={group.title}>
              {group.features.map((f) => (
                <FeatureRow key={f.name} feature={f} />
              ))}
            </Group>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={4}
          className="py-2 px-4 text-xs font-semibold text-muted-foreground bg-muted/30 border-b border-border/40"
        >
          {title}
        </td>
      </tr>
      {children}
    </>
  );
}
