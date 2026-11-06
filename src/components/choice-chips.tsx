"use client";

import { cn } from "cn";
import type { ReactNode } from "react";

interface ChoiceChipsProps<T extends string | number> {
  label: string;
  value: T | null;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}

/** Selección única en chips desplazables: más rápida que un select en el celular. */
export function ChoiceChips<T extends string | number>({ label, value, options, onChange, className }: ChoiceChipsProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("-mx-1 flex gap-2 overflow-x-auto px-1 pb-1", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors",
              selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-accent",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
