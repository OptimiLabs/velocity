import { cn } from "@/lib/utils";

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
  controlAlign?: "start" | "end";
}

export function SettingRow({
  label,
  description,
  children,
  controlAlign = "start",
}: SettingRowProps) {
  return (
    <div className="group grid gap-3 rounded-lg border border-transparent p-2 transition-colors hover:bg-muted/20 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center">
      <div className="min-w-0">
        <div className="text-xs font-medium group-hover:text-foreground transition-colors">
          {label}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
          {description}
        </div>
      </div>
      <div
        className={cn(
          "flex w-full",
          controlAlign === "end" ? "justify-start sm:justify-end" : "justify-start",
        )}
      >
        {children}
      </div>
    </div>
  );
}
