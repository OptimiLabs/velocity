"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { SourceCard } from "@/components/marketplace/SourceCard";
import { AddSourceForm } from "@/components/marketplace/AddSourceForm";
import {
  useMarketplaceSources,
  useDeleteSource,
  useToggleSource,
  useAddSource,
} from "@/hooks/useMarketplace";

interface SourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POPULAR_SOURCES = [
  {
    name: "GitHub: anthropics",
    source_type: "github_org" as const,
    config: { org: "anthropics" },
    label: "anthropics",
    description: "Anthropic's official repos",
  },
  {
    name: "GitHub: anthropic-community",
    source_type: "github_org" as const,
    config: { org: "anthropic-community" },
    label: "anthropic-community",
    description: "Community plugins and tools",
  },
  {
    name: "GitHub: modelcontextprotocol",
    source_type: "github_org" as const,
    config: { org: "modelcontextprotocol" },
    label: "modelcontextprotocol",
    description: "MCP reference servers",
  },
];

export function SourcesDialog({ open, onOpenChange }: SourcesDialogProps) {
  const { data: sources = [] } = useMarketplaceSources();
  const deleteSource = useDeleteSource();
  const toggleSource = useToggleSource();
  const addSource = useAddSource();

  // Determine which popular sources are already added
  const existingOrgs = new Set(
    sources
      .filter((s) => s.source_type === "github_org")
      .map((s) => s.config?.org)
      .filter(Boolean),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Sources</DialogTitle>
          <DialogDescription>
            Configure where marketplace packages are discovered from.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source cards grid */}
          {sources.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {sources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onToggle={(id, enabled) =>
                    toggleSource.mutate({ id, enabled })
                  }
                  onDelete={(id) => deleteSource.mutate(id)}
                  togglePending={toggleSource.isPending}
                  deletePending={deleteSource.isPending}
                />
              ))}
            </div>
          )}

          {sources.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No sources configured.
            </p>
          )}

          <Separator />

          {/* Popular Sources */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              Popular Sources
            </h4>
            <div className="grid gap-2 sm:grid-cols-3">
              {POPULAR_SOURCES.map((source) => {
                const alreadyAdded = existingOrgs.has(source.config.org);
                return (
                  <button
                    key={source.label}
                    onClick={() =>
                      addSource.mutate({
                        name: source.name,
                        source_type: source.source_type,
                        config: source.config,
                      })
                    }
                    disabled={alreadyAdded || addSource.isPending}
                    className="flex flex-col gap-0.5 px-3 py-2.5 rounded-md border border-border text-left hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-xs font-medium">{source.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {alreadyAdded ? "Already added" : source.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Add form */}
          <AddSourceForm />
        </div>
      </DialogContent>
    </Dialog>
  );
}
