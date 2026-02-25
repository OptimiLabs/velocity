"use client";

import { forwardRef } from "react";
import { Search, type LucideIcon } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchFieldProps extends Omit<InputProps, "type"> {
  containerClassName?: string;
  icon?: LucideIcon;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  (
    { containerClassName, className, icon: Icon = Search, inputSize = "default", ...props },
    ref,
  ) => {
    return (
      <div className={cn("relative", containerClassName)}>
        <Icon
          className={cn(
            "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50",
            inputSize === "sm" ? "size-3.5" : "size-4",
          )}
        />
        <Input
          ref={ref}
          type="search"
          inputSize={inputSize}
          className={cn(inputSize === "sm" ? "pl-7" : "pl-8", className)}
          {...props}
        />
      </div>
    );
  },
);
SearchField.displayName = "SearchField";
