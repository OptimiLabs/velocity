"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Sparkles } from "lucide-react";
import { fetchSkillsCached, type SkillInfo } from "@/lib/console/skills-cache";

interface SkillsPickerProps {
  onSelect: (skillName: string) => void;
  trigger?: React.ReactNode;
  className?: string;
}

export function SkillsPicker({
  onSelect,
  trigger,
  className,
}: SkillsPickerProps) {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      fetchSkillsCached().then(setSkills);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return skills;
    const q = search.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q),
    );
  }, [skills, search]);

  const handleSelect = (name: string) => {
    onSelect(name);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            className={className}
            title="Insert a skill"
          >
            <Sparkles size={14} />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-0">
        <div className="p-2 border-b border-border">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills..."
            className="h-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {skills.length === 0
                ? "No custom skills found"
                : "No matching skills"}
            </p>
          ) : (
            filtered.map((skill) => (
              <button
                key={skill.name}
                className="w-full text-left px-2.5 py-1.5 text-xs flex flex-col gap-0.5 hover:bg-muted/50 transition-colors"
                onClick={() => handleSelect(skill.name)}
              >
                <span className="font-mono font-medium text-foreground">
                  /{skill.name}
                </span>
                {skill.description && (
                  <span className="text-muted-foreground text-xs truncate">
                    {skill.description}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
