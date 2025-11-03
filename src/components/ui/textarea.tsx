"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  description?: string;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, label, id, description, error, ...props },
  ref
) {
  const autoId = useId();
  const textareaId = id ?? props.name ?? autoId;

  return (
    <label className="flex w-full flex-col gap-1.5 text-sm text-foreground" htmlFor={textareaId}>
      {label && <span className="font-medium text-foreground/90">{label}</span>}
      <textarea
        ref={ref}
        id={textareaId}
        className={cn(
          "min-h-[120px] w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted",
          error && "border-destructive focus:ring-destructive/20",
          className
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [description ? `${textareaId}-description` : null, error ? `${textareaId}-error` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        {...props}
      />
      {description && (
        <span id={`${textareaId}-description`} className="text-xs text-muted">
          {description}
        </span>
      )}
      {error && (
        <span id={`${textareaId}-error`} className="text-xs text-destructive">
          {error}
        </span>
      )}
    </label>
  );
});
