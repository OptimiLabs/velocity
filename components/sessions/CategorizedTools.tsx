"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Bot,
  Plug,
  Wrench,
} from "lucide-react";
import type { EnrichedToolData } from "@/types/session";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function Section({
  icon: Icon,
  title,
  count,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-background/35 p-1">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors",
          "hover:bg-muted/50 hover:text-foreground",
        )}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <Icon size={12} />
        <span className="flex-1 text-left font-medium">{title}</span>
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">
          {count}
        </Badge>
      </button>
      {open && <div className="mt-1 space-y-1 px-2 pb-1">{children}</div>}
    </div>
  );
}

function ToolRow({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/35 bg-background/60 px-2 py-1.5 text-xs">
      <span className="text-foreground/80 truncate">{name}</span>
      <span className="tabular-nums text-muted-foreground ml-2">{count}</span>
    </div>
  );
}

export function CategorizedTools({ data: raw }: { data: EnrichedToolData }) {
  const data: EnrichedToolData = {
    skills: raw.skills || [],
    agents: raw.agents || [],
    mcpTools: raw.mcpTools || {},
    coreTools: raw.coreTools || {},
    otherTools: raw.otherTools || {},
    filesModified: raw.filesModified || [],
    filesRead: raw.filesRead || [],
    searchedPaths: raw.searchedPaths || [],
  };

  const totalSkillCalls = data.skills.reduce((s, e) => s + e.count, 0);
  const totalMcpCalls = Object.values(data.mcpTools).reduce((s, c) => s + c, 0);

  // Merge core + other into one "Built-in" bucket
  const builtInTools: Record<string, number> = {
    ...data.coreTools,
    ...data.otherTools,
  };
  const totalBuiltIn = Object.values(builtInTools).reduce((s, c) => s + c, 0);

  return (
    <div className="space-y-2">
      <Section icon={Sparkles} title="Skills" count={totalSkillCalls}>
        {data.skills
          .sort((a, b) => b.count - a.count)
          .map((s) => (
            <ToolRow key={s.name} name={s.name} count={s.count} />
          ))}
      </Section>

      <Section icon={Bot} title="Agents" count={data.agents.length}>
        {data.agents.map((a, i) => (
          <div
            key={i}
            className="rounded-lg border border-border/35 bg-background/60 px-2 py-1.5 text-xs"
          >
            <span className="text-foreground/80">{a.type}</span>
            {a.description && (
              <span className="text-muted-foreground ml-1">
                — {a.description}
              </span>
            )}
          </div>
        ))}
      </Section>

      <Section icon={Plug} title="MCP / Plugins" count={totalMcpCalls}>
        {Object.entries(data.mcpTools)
          .sort(([, a], [, b]) => b - a)
          .map(([server, count]) => (
            <ToolRow key={server} name={server} count={count} />
          ))}
      </Section>

      <Section
        icon={Wrench}
        title="Built-in Tools"
        count={totalBuiltIn}
        defaultOpen={false}
      >
        {Object.entries(builtInTools)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => (
            <ToolRow key={name} name={name} count={count} />
          ))}
      </Section>
    </div>
  );
}
