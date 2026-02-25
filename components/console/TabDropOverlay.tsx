"use client";

import type { DragEvent } from "react";

export type DropZone = "left" | "right" | "top" | "bottom" | null;

export function getEdgeZone(e: DragEvent, el: HTMLElement): DropZone {
  const rect = el.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  const threshold = 0.3;

  const edges: { zone: DropZone; dist: number }[] = [
    { zone: "left", dist: x },
    { zone: "right", dist: 1 - x },
    { zone: "top", dist: y },
    { zone: "bottom", dist: 1 - y },
  ];
  const closest = edges.reduce((a, b) => (a.dist < b.dist ? a : b));
  return closest.dist < threshold ? closest.zone : null;
}

export function TabDropOverlay({ zone }: { zone: DropZone }) {
  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      <div
        className={`absolute left-0 top-0 w-1/3 h-full transition-all duration-150 ${
          zone === "left"
            ? "bg-primary/15 border-2 border-primary/50"
            : "bg-primary/5 border border-transparent"
        } rounded-l-sm flex items-center justify-center`}
      >
        {zone === "left" && (
          <span className="text-xs font-medium text-primary bg-background/90 px-2.5 py-1 rounded shadow-sm">
            Place Left
          </span>
        )}
      </div>
      <div
        className={`absolute right-0 top-0 w-1/3 h-full transition-all duration-150 ${
          zone === "right"
            ? "bg-primary/15 border-2 border-primary/50"
            : "bg-primary/5 border border-transparent"
        } rounded-r-sm flex items-center justify-center`}
      >
        {zone === "right" && (
          <span className="text-xs font-medium text-primary bg-background/90 px-2.5 py-1 rounded shadow-sm">
            Place Right
          </span>
        )}
      </div>
      <div
        className={`absolute left-1/3 top-0 w-1/3 h-1/3 transition-all duration-150 ${
          zone === "top"
            ? "bg-primary/15 border-2 border-primary/50"
            : "bg-primary/5 border border-transparent"
        } flex items-center justify-center`}
      >
        {zone === "top" && (
          <span className="text-xs font-medium text-primary bg-background/90 px-2.5 py-1 rounded shadow-sm">
            Place Top
          </span>
        )}
      </div>
      <div
        className={`absolute left-1/3 bottom-0 w-1/3 h-1/3 transition-all duration-150 ${
          zone === "bottom"
            ? "bg-primary/15 border-2 border-primary/50"
            : "bg-primary/5 border border-transparent"
        } flex items-center justify-center`}
      >
        {zone === "bottom" && (
          <span className="text-xs font-medium text-primary bg-background/90 px-2.5 py-1 rounded shadow-sm">
            Place Bottom
          </span>
        )}
      </div>
    </div>
  );
}
