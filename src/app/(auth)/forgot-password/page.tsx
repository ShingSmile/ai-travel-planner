"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { AuthCard } from "@/components/auth/auth-card";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!email) {
      setFormError("请填写注册邮箱。");
      return;
    }

    try {
      setLoading(true);
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error("系统暂未配置数据服务，请稍后再试。");
      }
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        setFormError(error.message);
        return;
      }

      toast({
        title: "重置邮件已发送",
        description: "请前往邮箱点击链接设置新密码。",
        variant: "success",
      });
      setEmail("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "发送失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="重置密码"
      description="输入注册邮箱，系统将发送重置链接。"
      footer={
        <div className="flex justify-center gap-4">
          <Link href="/login" className="text-primary hover:underline">
            返回登录
          </Link>
          <Link href="/register" className="text-primary hover:underline">
            注册新账号
          </Link>
        </div>
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
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          {loading ? (
            <>
              <Spinner size="sm" />
              发送中...
            </>
          ) : (
            "发送重置邮件"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
