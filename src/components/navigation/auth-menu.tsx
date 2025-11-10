"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";

export function AuthMenu() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner size="sm" />
        <span>状态同步中...</span>
      </div>
    );
  }

  const handleSignOut = async () => {
    if (signingOut) {
      return;
    }
    try {
      setSigningOut(true);
      await signOut();
      toast({
        title: "已退出登录",
        description: "期待下次再见，祝旅途愉快。",
        variant: "success",
      });
      router.push("/");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "退出失败，请稍后再试。";
      toast({
        title: "退出登录失败",
        description: message,
        variant: "error",
      });
    } finally {
      setSigningOut(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center gap-3 text-sm font-medium">
        <Link
          href="/login"
          className="rounded-xl px-4 py-2 text-muted transition hover:text-foreground"
        >
          登录
        </Link>
        <Link
          href="/register"
          className="rounded-xl bg-primary px-4 py-2 text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          注册体验
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm font-medium">
      <div className="hidden min-w-[120px] max-w-[200px] flex-col text-right sm:flex">
        <span className="text-xs text-muted">欢迎回来</span>
        <span className="truncate font-semibold text-foreground">{user.email ?? "已登录账户"}</span>
      </div>
      <Link
        href="/trips"
        className="rounded-xl px-4 py-2 text-muted transition hover:text-foreground"
      >
        我的行程
      </Link>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="rounded-xl bg-primary px-4 py-2 text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {signingOut ? "退出中..." : "退出登录"}
      </button>
    </div>
  );
}
