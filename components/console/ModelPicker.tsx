"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODEL_PRICING } from "@/lib/cost/pricing";
import { MODEL_LABELS, formatPrice } from "@/lib/console/models";

interface ModelPickerProps {
  value?: string;
  onChange: (model: string | undefined) => void;
  className?: string;
  showPricing?: boolean;
}

export function ModelPicker({ value, onChange, className, showPricing = false }: ModelPickerProps) {
  return (
    <Select
      value={value || "__default__"}
      onValueChange={(v) => onChange(v === "__default__" ? undefined : v)}
    >
      <SelectTrigger className={`h-7 text-xs ${className || ""}`}>
        <SelectValue placeholder="Default model" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__default__" className="text-xs">
          Default
        </SelectItem>
        {Object.keys(MODEL_LABELS).map((id) => {
          const pricing = MODEL_PRICING[id];
          return (
            <SelectItem key={id} value={id} className="text-xs font-mono">
              {MODEL_LABELS[id]}
              {showPricing && pricing && (
                <span className="text-muted-foreground ml-1.5 font-normal">
                  {formatPrice(pricing.input)} / {formatPrice(pricing.output)}
                </span>
              )}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
