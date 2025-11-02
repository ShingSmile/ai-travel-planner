"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, id, description, error, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id ?? props.name ?? autoId;

  return (
    <label className="flex w-full flex-col gap-1.5 text-sm text-foreground" htmlFor={inputId}>
      {label && <span className="font-medium text-foreground/90">{label}</span>}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted",
          error && "border-destructive focus:ring-destructive/20",
          className
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [description ? `${inputId}-description` : null, error ? `${inputId}-error` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        {...props}
      />
      {description && (
        <span id={`${inputId}-description`} className="text-xs text-muted">
          {description}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} className="text-xs text-destructive">
          {error}
        </span>
      )}
    </label>
  );
});
