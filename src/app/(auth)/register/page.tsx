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

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!email || !password) {
      setFormError("请填写邮箱与密码。");
      return;
    }

    if (password.length < 6) {
      setFormError("密码长度至少 6 位。");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("两次输入的密码不一致。");
      return;
    }

    try {
      setLoading(true);
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("系统暂未配置数据服务，请稍后再试。");
      }
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        setFormError(error.message);
        return;
      }

      toast({
        title: "注册成功",
        description: "请前往邮箱完成验证，随后即可登录体验。",
        variant: "success",
      });
      router.push("/login");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "注册失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="创建账户"
      description="注册后即可同步行程、预算与语音记录。"
      footer={
        <>
          已有账号？
          <Link href="/login" className="ml-1 text-primary hover:underline">
            立即登录
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
          autoComplete="new-password"
          placeholder="设置登录密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input
          label="确认密码"
          type="password"
          autoComplete="new-password"
          placeholder="再次输入登录密码"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          {loading ? (
            <>
              <Spinner size="sm" />
              注册中...
            </>
          ) : (
            "注册"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
