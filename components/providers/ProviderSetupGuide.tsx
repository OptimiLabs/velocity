"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProviderSetupGuideProps {
  steps: string[];
  dashboardUrl: string;
}

export function ProviderSetupGuide({
  steps,
  dashboardUrl,
}: ProviderSetupGuideProps) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Setup Guide
      </div>
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full bg-muted text-xs font-bold text-text-tertiary tabular-nums">
              {i + 1}
            </span>
            <span className="text-foreground leading-5">{step}</span>
          </li>
        ))}
      </ol>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs mt-1"
        asChild
      >
        <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
          Open provider dashboard
          <ExternalLink size={12} />
        </a>
      </Button>
    </div>
  );
}
