"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function AuthCard({ title, description, children, footer, className }: AuthCardProps) {
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-3xl border border-border bg-surface/90 p-8 shadow-card backdrop-blur-lg",
        className
      )}
    >
      <div className="space-y-3 text-center">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
    </div>
  );
}
