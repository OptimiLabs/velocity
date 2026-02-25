import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5 border border-border/40">
      {tabs.map(({ id, label, count }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={cn(
              "relative px-3.5 py-1.5 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isActive
                ? "bg-background text-foreground shadow-sm border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50 border border-transparent",
            )}
          >
            {label}
            {count !== undefined && (
              <span
                className={cn(
                  "ml-1.5 text-meta font-medium",
                  isActive
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
