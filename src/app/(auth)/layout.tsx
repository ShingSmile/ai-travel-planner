import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center py-16">
      {children}
    </div>
  );
}
