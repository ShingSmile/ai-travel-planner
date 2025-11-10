"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { AuthCard } from "@/components/auth/auth-card";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!email || !password) {
      setFormError("请填写邮箱与密码。");
      return;
    }

    try {
      setLoading(true);
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("系统暂未配置数据服务，请稍后再试。");
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setFormError(error.message);
        return;
      }

      toast({
        title: "登录成功",
        description: "欢迎回来，正在跳转到首页。",
        variant: "success",
      });
      router.push("/");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "登录失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="欢迎回来"
      description="使用注册邮箱登录，继续管理你的旅行规划。"
      footer={
        <>
          没有账号？
          <Link href="/register" className="ml-1 text-primary hover:underline">
            立即注册
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="邮箱"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="密码"
          type="password"
          autoComplete="current-password"
          placeholder="请输入密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted">使用 Supabase Auth 进行安全登录</div>
          <Link href="/forgot-password" className="text-primary hover:underline">
            忘记密码？
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          {loading ? (
            <>
              <Spinner size="sm" />
              登录中...
            </>
          ) : (
            "登录"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
