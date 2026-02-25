"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface InlineDiffProps {
  oldString: string;
  newString: string;
}

export function InlineDiff({ oldString, newString }: InlineDiffProps) {
  const lines = useMemo(() => {
    const oldLines = oldString.split("\n");
    const newLines = newString.split("\n");
    const result: Array<{
      type: "removed" | "added" | "unchanged";
      text: string;
    }> = [];

    // Simple greedy line-by-line diff
    let oi = 0;
    let ni = 0;
    while (oi < oldLines.length || ni < newLines.length) {
      if (
        oi < oldLines.length &&
        ni < newLines.length &&
        oldLines[oi] === newLines[ni]
      ) {
        result.push({ type: "unchanged", text: oldLines[oi] });
        oi++;
        ni++;
      } else if (
        oi < oldLines.length &&
        (ni >= newLines.length || !newLines.slice(ni).includes(oldLines[oi]))
      ) {
        result.push({ type: "removed", text: oldLines[oi] });
        oi++;
      } else if (ni < newLines.length) {
        result.push({ type: "added", text: newLines[ni] });
        ni++;
      }
    }

    return result;
  }, [oldString, newString]);

  return (
    <div className="font-mono text-xs leading-5 overflow-x-auto">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "px-2 whitespace-pre",
            line.type === "removed" && "bg-destructive/10 text-destructive",
            line.type === "added" &&
              "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          <span className="inline-block w-4 select-none opacity-50 mr-1">
            {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
          </span>
          {line.text || "\u00A0"}
        </div>
      ))}
    </div>
  );
}
