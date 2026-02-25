"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Bot,
  FileText,
  Store,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  GripVertical,
} from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { AgentInventoryItem } from "./AgentInventoryItem";
import { PromptInventoryItem } from "./PromptInventoryItem";
import { CATEGORY_MAP, getAgentCategory, getCategoryColor } from "@/lib/agents/categories";
import type { Agent } from "@/types/agent";
import type { PromptFileFrontmatter } from "@/lib/claude-md";

interface PromptFile {
  filename: string;
  frontmatter: PromptFileFrontmatter;
  content: string;
  fullPath: string;
}

interface InventorySidebarProps {
  agents: Agent[];
  selectedId: string | null;
  selectedType: string | null;
  collapsed: boolean;
  width: number;
  onSelectAgent: (name: string) => void;
  onSelectPrompt: (filename: string) => void;
  onToggleCollapse: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onToggleAgent?: (name: string, enabled: boolean) => void;
  workspaceAgentNames?: Set<string>;
  onAddToWorkspace?: (agent: Agent) => void;
}

type SectionId = "agents" | "prompts" | "marketplace";

const sectionMeta: Record<SectionId, { icon: typeof Bot; label: string }> = {
  agents: { icon: Bot, label: "My Agents" },
  prompts: { icon: FileText, label: "Prompts" },
  marketplace: { icon: Store, label: "Marketplace" },
};

export function InventorySidebar({
  agents,
  selectedId,
  selectedType,
  collapsed,
  width,
  onSelectAgent,
  onSelectPrompt,
  onToggleCollapse,
  onDragStart,
  onToggleAgent,
  workspaceAgentNames,
  onAddToWorkspace,
}: InventorySidebarProps) {
  const searchQuery = useWorkspaceStore((s) => s.searchQuery);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    agents: true,
    prompts: false,
    marketplace: false,
  });
  const [promptFiles, setPromptFiles] = useState<PromptFile[]>([]);

  useEffect(() => {
    fetch("/api/claude-md")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PromptFile[]) => setPromptFiles(data))
      .catch((err) => console.debug('[AGENTS]', err.message));
  }, []);

  const toggle = (s: string) =>
    setExpanded((prev) => ({ ...prev, [s]: !prev[s] }));

  const q = searchQuery.toLowerCase();
  const filteredAgents = q
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q),
      )
    : agents;
  const filteredPrompts = q
    ? promptFiles.filter((p) => p.filename.toLowerCase().includes(q))
    : promptFiles;

  // Group agents by category
  const agentsByCategory = useMemo(() => {
    const groups: Record<string, Agent[]> = {};
    for (const agent of filteredAgents) {
      const cat = getAgentCategory(agent);
      (groups[cat] ??= []).push(agent);
    }
    // Sort: known categories in CATEGORY_MAP order, then unknown, "general" last
    const knownOrder = Object.keys(CATEGORY_MAP);
    return Object.entries(groups).sort(([a], [b]) => {
      const ai = knownOrder.indexOf(a);
      const bi = knownOrder.indexOf(b);
      // Unknown categories go after known ones but before "general"
      const aIdx = ai === -1 ? knownOrder.length - 1 : ai;
      const bIdx = bi === -1 ? knownOrder.length - 1 : bi;
      return aIdx - bIdx;
    });
  }, [filteredAgents]);

  if (collapsed) {
    return (
      <div className="w-12 border-r border-border bg-card/30 flex flex-col items-center py-3 gap-3 shrink-0">
        <button
          onClick={onToggleCollapse}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <PanelLeft size={16} />
        </button>
        {(Object.keys(sectionMeta) as SectionId[]).map((s) => {
          const Icon = sectionMeta[s].icon;
          return (
            <button
              key={s}
              onClick={() => {
                onToggleCollapse();
                setExpanded((prev) => ({ ...prev, [s]: true }));
              }}
              title={sectionMeta[s].label}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="border-r border-border bg-card/30 flex flex-col shrink-0 relative"
      style={{ width }}
    >
      {/* Collapse toggle */}
      <div className="flex items-center justify-end px-3 py-2 border-b border-border/50">
        <button
          onClick={onToggleCollapse}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {/* Agents */}
        <SectionHeader
          section="agents"
          count={filteredAgents.length}
          expanded={expanded.agents ?? true}
          onToggle={() => toggle("agents")}
        />
        {(expanded.agents ?? true) && (
          <TreeBranch>
            {agentsByCategory.map(([cat, catAgents]) => {
              const catInfo = CATEGORY_MAP[cat];
              const CatIcon = catInfo?.icon ?? Bot;
              const catLabel = catInfo?.label ?? cat;
              const catColor = getCategoryColor(cat);
              const sectionKey = `agents:${cat}`;
              const isExpanded = expanded[sectionKey] ?? true;

              return (
                <div key={cat}>
                  <SubSectionHeader
                    label={catLabel}
                    icon={<CatIcon size={10} className={catColor} />}
                    count={catAgents.length}
                    expanded={isExpanded}
                    onToggle={() => toggle(sectionKey)}
                  />
                  {isExpanded && (
                    <TreeBranch>
                      {catAgents.map((a, i) => (
                        <TreeLeaf key={a.name} isLast={i === catAgents.length - 1}>
                          <AgentInventoryItem
                            agent={a}
                            selected={selectedType === "agent" && selectedId === a.name}
                            onSelect={() => onSelectAgent(a.name)}
                            onToggleEnabled={onToggleAgent}
                            inWorkspace={workspaceAgentNames?.has(a.name)}
                            onAddToWorkspace={onAddToWorkspace ? () => onAddToWorkspace(a) : undefined}
                          />
                        </TreeLeaf>
                      ))}
                    </TreeBranch>
                  )}
                </div>
              );
            })}
            {agentsByCategory.length === 0 && (
              <p className="text-meta text-text-tertiary px-2 py-1">
                No agents
              </p>
            )}
          </TreeBranch>
        )}

        {/* Prompts */}
        <SectionHeader
          section="prompts"
          count={filteredPrompts.length}
          expanded={expanded.prompts ?? false}
          onToggle={() => toggle("prompts")}
          hint="drag to attach"
        />
        {(expanded.prompts ?? false) && (
          <TreeBranch>
            {filteredPrompts.map((p, i) => (
              <TreeLeaf key={p.filename} isLast={i === filteredPrompts.length - 1}>
                <PromptInventoryItem
                  filename={p.filename}
                  category={p.frontmatter?.category}
                  selected={
                    selectedType === "prompt" && selectedId === p.filename
                  }
                  onSelect={() => onSelectPrompt(p.filename)}
                />
              </TreeLeaf>
            ))}
            {filteredPrompts.length === 0 && (
              <p className="text-meta text-text-tertiary px-2 py-1">
                No prompts
              </p>
            )}
          </TreeBranch>
        )}
      </div>

      {/* Drag handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors"
        onMouseDown={onDragStart}
      />
    </div>
  );
}

function SectionHeader({
  section,
  count,
  expanded,
  onToggle,
  hint,
}: {
  section: SectionId;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  hint?: string;
}) {
  const { icon: Icon, label } = sectionMeta[section];
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <Chevron size={12} />
      <Icon size={12} />
      <span className="uppercase tracking-wider text-meta font-medium">
        {label}
      </span>
      {hint && (
        <span className="text-micro text-text-quaternary flex items-center gap-0.5 ml-1">
          <GripVertical size={8} />
          {hint}
        </span>
      )}
      {count > 0 && (
        <span className="ml-auto text-meta text-text-tertiary bg-muted/50 px-1 rounded">
          {count}
        </span>
      )}
    </button>
  );
}

function SubSectionHeader({
  label,
  icon,
  count,
  expanded,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <Chevron size={10} />
      {icon}
      <span className="text-meta font-medium">{label}</span>
      {count > 0 && (
        <span className="ml-auto text-micro text-text-tertiary bg-muted/40 px-1 rounded">
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Tree view building blocks ─────────────────────────────────────── */

/** Vertical indent guide line wrapping nested children. */
function TreeBranch({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-[9px] pl-2.5 border-l border-border/40 space-y-0.5">
      {children}
    </div>
  );
}

/** Leaf node with a horizontal connector to the guide line. */
function TreeLeaf({
  children,
  isLast,
}: {
  children: React.ReactNode;
  isLast: boolean;
}) {
  return (
    <div className="relative">
      {/* Horizontal connector line */}
      <div className="absolute -left-2.5 top-1/2 w-2 h-px bg-border/40" />
      {/* Mask the vertical guide below the last item */}
      {isLast && (
        <div className="absolute -left-[10.5px] top-1/2 bottom-0 w-px bg-card/30" />
      )}
      {children}
    </div>
  );
}
