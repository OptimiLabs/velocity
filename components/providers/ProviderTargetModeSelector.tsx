"use client";

import type { ConfigProvider } from "@/types/provider";
import type { ProviderTargetMode } from "@/types/provider-artifacts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ProviderTargetModeSelectorProps {
  value: ProviderTargetMode;
  onChange: (value: ProviderTargetMode) => void;
  disabled?: boolean;
  className?: string;
  includeAll?: boolean;
  providers?: ConfigProvider[];
  ariaLabel?: string;
}

const PROVIDER_LABELS: Record<ConfigProvider, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
};

export function ProviderTargetModeSelector({
  value,
  onChange,
  disabled,
  className,
  includeAll = true,
  providers,
  ariaLabel = "Target provider",
}: ProviderTargetModeSelectorProps) {
  const allProviders: ConfigProvider[] = ["claude", "codex", "gemini"];
  const optionProviders = (providers?.length ? providers : allProviders).filter(
    (provider, index, arr) =>
      (provider === "claude" || provider === "codex" || provider === "gemini") &&
      arr.indexOf(provider) === index,
  );

  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as ProviderTargetMode)}
      disabled={disabled}
    >
      <SelectTrigger
        className={cn("h-7 min-w-[132px] text-xs", className)}
        aria-label={ariaLabel}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {includeAll && optionProviders.length > 1 && (
          <SelectItem value="all">All providers</SelectItem>
        )}
        {optionProviders.map((provider) => (
          <SelectItem key={provider} value={provider}>
            {PROVIDER_LABELS[provider]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
