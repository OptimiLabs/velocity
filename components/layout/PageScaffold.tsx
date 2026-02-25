"use client";

import { cn } from "@/lib/utils";
import { useAppSettings } from "@/hooks/useAppSettings";

interface PageScaffoldProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function PageScaffold({
  title,
  subtitle,
  actions,
  filters,
  status,
  children,
  className,
  bodyClassName,
}: PageScaffoldProps) {
  const { data: appSettings } = useAppSettings();
  const disableHeaderView = appSettings?.disableHeaderView === true;

  if (disableHeaderView) {
    return (
      <div className={cn("space-y-5 sm:space-y-6", className)}>
        {filters && (
          <section className="overflow-hidden rounded-xl border border-border/60 bg-card/70 shadow-sm">
            <div className="px-4 py-3">{filters}</div>
          </section>
        )}

        {status && (
          <section className="overflow-hidden rounded-xl border border-border/60 bg-card/70 shadow-sm">
            <div className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">{status}</div>
            </div>
          </section>
        )}

        {actions && (
          <section className="overflow-hidden rounded-xl border border-border/60 bg-card/70 shadow-sm">
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
              {actions}
            </div>
          </section>
        )}

        <div className={cn("space-y-5 sm:space-y-6", bodyClassName)}>{children}</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="relative p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm text-muted-foreground max-w-3xl">
                  {subtitle}
                </p>
              )}
            </div>
            {(actions || status) && (
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {status}
                {actions}
              </div>
            )}
          </div>
          {filters && (
            <div className="mt-4 overflow-hidden rounded-xl border border-border/60 bg-background/70 backdrop-blur-sm">
              <div className="px-4 py-3">{filters}</div>
            </div>
          )}
        </div>
      </section>

      <div className={cn("space-y-6", bodyClassName)}>{children}</div>
    </div>
  );
}
