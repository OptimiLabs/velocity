import { cn } from "@/lib/utils";
import type { ConfigProvider } from "@/types/provider";
import { getSessionProvider } from "@/lib/providers/session-registry";

export function ProviderBadge({
  provider,
  className,
}: {
  provider: ConfigProvider;
  className?: string;
}) {
  const def = getSessionProvider(provider);
  if (!def) return null;
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded border font-medium",
        def.badgeClasses.bg,
        def.badgeClasses.text,
        def.badgeClasses.border,
        className,
      )}
    >
      {def.label}
    </span>
  );
}
