import { cn } from "cn";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

interface FormFieldProps {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function FormField({ id, label, error, hint, className, children }: FormFieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id} className="text-[13px] font-semibold text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] font-medium text-negative">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
