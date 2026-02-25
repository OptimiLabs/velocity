"use client";

import Link from "next/link";
import { Maximize2 } from "lucide-react";

interface CardExpandWrapperProps {
  href: string;
  children: React.ReactNode;
}

export function CardExpandWrapper({ href, children }: CardExpandWrapperProps) {
  return (
    <div className="relative group">
      {children}
      <Link
        href={href}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-background/80 hover:bg-muted border border-border/50 text-muted-foreground hover:text-foreground"
        title="Open full-page view"
      >
        <Maximize2 size={14} />
      </Link>
    </div>
  );
}
