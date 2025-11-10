import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import Link from "next/link";
import { AuthMenu } from "@/components/navigation/auth-menu";

const geistSans = { variable: "" };
const geistMono = { variable: "" };

export const metadata: Metadata = {
  title: "AI 旅行规划师",
  description: "一站式智能行程规划、预算管理与语音辅助的 Web 应用。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <AppProviders>
          <div className="relative flex min-h-screen flex-col">
            <header className="sticky inset-x-0 top-0 z-40 border-b border-border/60 bg-surface/80 backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                    AI
                  </span>
                  <span>旅行规划师</span>
                </Link>
                <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
                  <Link href="/trips" className="transition hover:text-foreground">
                    我的行程
                  </Link>
                  <Link href="/planner/new" className="transition hover:text-foreground">
                    创建规划
                  </Link>
                </nav>
                <AuthMenu />
              </div>
            </header>
            <main className="flex-1">
              <div className="mx-auto w-full max-w-6xl px-6 py-12">{children}</div>
            </main>
            <footer className="border-t border-border/60 bg-surface py-8">
              <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 text-sm text-muted md:flex-row md:items-center md:justify-between">
                <span>© {new Date().getFullYear()} AI 旅行规划师 · 智能出行，从这里开始</span>
                <div className="flex items-center gap-4">
                  <Link href="/privacy" className="transition hover:text-foreground">
                    隐私与安全
                  </Link>
                  <Link href="/terms" className="transition hover:text-foreground">
                    使用条款
                  </Link>
                  <Link href="/changelog" className="transition hover:text-foreground">
                    更新日志
                  </Link>
                </div>
              </div>
            </footer>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
