"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import {
  format,
  subDays,
  differenceInHours,
  startOfDay,
  endOfDay,
  setHours,
  setMinutes,
} from "date-fns";
import type { DateRange as DayPickerRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const PRESETS = [
  { label: "Today", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: 0 },
] as const;

function matchesPreset(value: DateRange, days: number): boolean {
  if (days === 0) return !value.from && !value.to;
  if (!value.from) return false;
  const expected = days === 1 ? startOfDay(new Date()) : startOfDay(subDays(new Date(), days));
  return Math.abs(differenceInHours(value.from, expected)) <= 24;
}

function getTriggerLabel(value: DateRange): string {
  for (const preset of PRESETS) {
    if (matchesPreset(value, preset.days)) return preset.label;
  }
  if (value.from && value.to) {
    return `${format(value.from, "MMM d")} – ${format(value.to, "MMM d")}`;
  }
  if (value.from) {
    return `${format(value.from, "MMM d")} – ...`;
  }
  return "All time";
}

export function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const isCustom =
    value.from &&
    !PRESETS.some((p) => p.days > 0 && matchesPreset(value, p.days));

  const [fromHour, setFromHour] = React.useState("00");
  const [fromMin, setFromMin] = React.useState("00");
  const [toHour, setToHour] = React.useState("23");
  const [toMin, setToMin] = React.useState("59");

  // Sync time inputs when value changes externally
  React.useEffect(() => {
    if (value.from) {
      setFromHour(String(value.from.getHours()).padStart(2, "0"));
      setFromMin(String(value.from.getMinutes()).padStart(2, "0"));
    }
    if (value.to) {
      setToHour(String(value.to.getHours()).padStart(2, "0"));
      setToMin(String(value.to.getMinutes()).padStart(2, "0"));
    }
  }, [value.from, value.to]);

  function applyPreset(days: number) {
    if (days === 0) {
      onChange({ from: undefined, to: undefined });
    } else if (days === 1) {
      onChange({
        from: startOfDay(new Date()),
        to: endOfDay(new Date()),
      });
    } else {
      onChange({
        from: startOfDay(subDays(new Date(), days)),
        to: endOfDay(new Date()),
      });
    }
    setOpen(false);
  }

  function handleCalendarSelect(range: DayPickerRange | undefined) {
    if (!range) return;
    const from = range.from
      ? setMinutes(
          setHours(range.from, parseInt(fromHour) || 0),
          parseInt(fromMin) || 0,
        )
      : undefined;
    const to = range.to
      ? setMinutes(
          setHours(range.to, parseInt(toHour) || 23),
          parseInt(toMin) || 59,
        )
      : undefined;
    onChange({ from, to });
  }

  function handleTimeChange(
    field: "fromHour" | "fromMin" | "toHour" | "toMin",
    val: string,
  ) {
    const num = val.replace(/\D/g, "").slice(0, 2);
    const isHour = field === "fromHour" || field === "toHour";
    const clamped = String(
      Math.min(parseInt(num) || 0, isHour ? 23 : 59),
    ).padStart(2, "0");

    if (field === "fromHour") setFromHour(clamped);
    else if (field === "fromMin") setFromMin(clamped);
    else if (field === "toHour") setToHour(clamped);
    else setToMin(clamped);

    // Apply to range on blur-equivalent (we apply immediately for responsiveness)
    const clampedValue = parseInt(clamped) || 0;
    const fh = field === "fromHour" ? clampedValue : parseInt(fromHour) || 0;
    const fm = field === "fromMin" ? clampedValue : parseInt(fromMin) || 0;
    const th = field === "toHour" ? clampedValue : parseInt(toHour) || 0;
    const tm = field === "toMin" ? clampedValue : parseInt(toMin) || 0;

    if (value.from || value.to) {
      onChange({
        from: value.from
          ? setMinutes(setHours(value.from, Math.min(fh, 23)), Math.min(fm, 59))
          : undefined,
        to: value.to
          ? setMinutes(setHours(value.to, Math.min(th, 23)), Math.min(tm, 59))
          : undefined,
      });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 text-xs gap-1.5 font-normal",
            !value.from && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-3.5" />
          {getTriggerLabel(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex">
          {/* Presets sidebar */}
          <div className="flex flex-col gap-0.5 border-r p-2 w-[120px]">
            {PRESETS.map((preset) => (
              <button
                key={preset.days}
                onClick={() => applyPreset(preset.days)}
                className={cn(
                  "text-left text-xs px-2 py-1.5 rounded-md transition-colors",
                  matchesPreset(value, preset.days)
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Calendar + time */}
          <div className="p-0">
            <Calendar
              mode="range"
              selected={
                value.from ? { from: value.from, to: value.to } : undefined
              }
              onSelect={handleCalendarSelect}
              numberOfMonths={1}
              disabled={{ after: new Date() }}
            />

            {/* Time inputs — only shown for custom ranges */}
            {isCustom && (
              <div className="flex items-center gap-3 px-3 pb-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="w-9">From</span>
                  <TimeInput
                    value={fromHour}
                    onChange={(v) => handleTimeChange("fromHour", v)}
                  />
                  <span>:</span>
                  <TimeInput
                    value={fromMin}
                    onChange={(v) => handleTimeChange("fromMin", v)}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-5">To</span>
                  <TimeInput
                    value={toHour}
                    onChange={(v) => handleTimeChange("toHour", v)}
                  />
                  <span>:</span>
                  <TimeInput
                    value={toMin}
                    onChange={(v) => handleTimeChange("toMin", v)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-7 h-6 text-center text-xs rounded border border-border/50 bg-transparent tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}
