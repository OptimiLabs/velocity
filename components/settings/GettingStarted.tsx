"use client";

import { useState, useEffect } from "react";
import { Zap, FileText, Server, Shield, X } from "lucide-react";

interface GettingStartedProps {
  onNavigate: (tab: string) => void;
}

export function GettingStarted({ onNavigate }: GettingStartedProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    try {
      setDismissed(
        localStorage.getItem("settings-onboarding-dismissed") === "true",
      );
    } catch {}
  }, []);

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem("settings-onboarding-dismissed", "true");
  };

  if (dismissed) return null;

  const steps = [
    {
      icon: <Zap size={16} />,
      label: "Set up your first hook",
      desc: "Automate linting, formatting, or validation",
      tab: "hooks",
    },
    {
      icon: <FileText size={16} />,
      label: "Create a custom command",
      desc: "Build reusable slash commands",
      tab: "general",
    },
    {
      icon: <Server size={16} />,
      label: "Add an MCP server",
      desc: "Extend Claude with custom tools",
      tab: "mcp",
    },
    {
      icon: <Shield size={16} />,
      label: "Configure permissions",
      desc: "Control what Claude can do",
      tab: "permissions",
    },
  ];

  return (
    <div className="relative border border-primary/20 bg-primary/5 rounded-xl p-4 space-y-3">
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X size={14} />
      </button>
      <h3 className="text-sm font-medium">Getting Started</h3>
      <p className="text-xs text-muted-foreground">
        Customize Claude Code to fit your workflow.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {steps.map((step) => (
          <button
            key={step.tab}
            onClick={() => onNavigate(step.tab)}
            className="flex items-start gap-3 text-left p-3 rounded-lg bg-background border border-border hover:border-primary/40 transition-all group"
          >
            <span className="text-primary mt-0.5">{step.icon}</span>
            <div>
              <div className="text-xs font-medium group-hover:text-primary transition-colors">
                {step.label}
              </div>
              <div className="text-meta text-muted-foreground">{step.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
