"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TablePaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function TablePagination({
  page,
  totalPages,
  onPageChange,
}: TablePaginationProps) {
  const [inputValue, setInputValue] = useState(String(page + 1));

  // Sync input when page changes externally (e.g. prev/next buttons, filter reset)
  useEffect(() => {
    setInputValue(String(page + 1));
  }, [page]);

  const handleSubmit = () => {
    const num = parseInt(inputValue, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      onPageChange(num - 1);
    } else {
      setInputValue(String(page + 1));
    }
  };

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.max(0, page - 1))}
        disabled={page === 0}
        className="h-7 text-xs"
      >
        <ChevronLeft size={12} />
        Prev
      </Button>
      <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
        <input
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          className="w-10 h-6 text-center text-xs font-mono bg-transparent border border-border/50 rounded text-foreground outline-none focus:border-primary/50 tabular-nums"
        />
        <span>/ {totalPages}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        className="h-7 text-xs"
      >
        Next
        <ChevronRight size={12} />
      </Button>
    </div>
  );
}
