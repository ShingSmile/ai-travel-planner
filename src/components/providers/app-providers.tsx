"use client";

import { ToastProvider } from "@/components/ui/toast";
import { AuthProvider } from "@/components/providers/auth-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
