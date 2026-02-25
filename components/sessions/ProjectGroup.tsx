"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  DollarSign,
  Zap,
} from "lucide-react";
import { SessionCard } from "./SessionCard";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import type { Session, Project } from "@/types/session";

interface ProjectGroupProps {
  project: Project & { sessions: Session[]; session_count: number };
  defaultExpanded?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
}

export function ProjectGroup({
  project,
  defaultExpanded = false,
  selectedIds,
  onToggleSelect,
}: ProjectGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Folder size={14} className="text-primary" />
        <span className="font-medium text-sm">{project.name}</span>
        <span className="text-xs text-muted-foreground ml-1">
          {project.session_count} sessions
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <DollarSign size={11} />
            {formatCost(project.total_cost)}
          </span>
          <span className="flex items-center gap-1">
            <Zap size={11} />
            {formatTokens(project.total_tokens)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-4">
          {project.sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              selected={selectedIds?.includes(session.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
