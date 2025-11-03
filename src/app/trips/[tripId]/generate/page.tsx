"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { getSupabaseClient } from "@/lib/supabase-client";
import type { LLMGenerationUsage, StructuredTripPlan } from "@/lib/llm";

const steps = [
  { key: "prepare", label: "准备行程数据" },
  { key: "llm", label: "调用 LLM 生成规划" },
  { key: "persist", label: "写入数据库并完成" },
];

type GenerationStatus = "pending" | "success" | "error";

interface GenerationResponse {
  tripId: string;
  plan: StructuredTripPlan;
  usage: LLMGenerationUsage | null;
  attempts: number;
}

export default function TripGeneratePage({ params }: { params: { tripId: string } }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const { toast } = useToast();
  const router = useRouter();

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [status, setStatus] = useState<GenerationStatus>("pending");
  const [currentStep, setCurrentStep] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [progress, setProgress] = useState(10);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [result, setResult] = useState<GenerationResponse | null>(null);

  const hasTriggeredRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSessionToken(data.session?.access_token ?? null);
      })
      .finally(() => setLoadingSession(false));
  }, [supabase]);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const triggerGeneration = useCallback(
    async (force = false) => {
      if (!sessionToken) {
        setErrorMessage("尚未登录，无法生成行程。");
        setStatus("error");
        return;
      }

      clearProgressTimer();
      setStatus("pending");
      setErrorMessage(null);
      setCurrentStep(0);
      setCompletedCount(0);
      setCurrentStep(1);
      setCompletedCount(1);
      setProgress(16);
      setResult(null);

      progressTimerRef.current = window.setInterval(() => {
        setProgress((current) => {
          if (current >= 94) return current;
          return Math.min(current + Math.random() * 9 + 3, 94);
        });
      }, 700);

      try {
        const response = await fetch("/api/llm/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            tripId: params.tripId,
            forceRegenerate: force,
          }),
        });

        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error?.message ?? "行程生成失败，请稍后重试。");
        }

        const data = payload.data as GenerationResponse;
        clearProgressTimer();
        setProgress(100);
        setCurrentStep(steps.length - 1);
        setCompletedCount(steps.length);
        setStatus("success");
        setResult(data);
        toast({
          title: "行程生成成功",
          description: "已将最新行程写入数据库，可前往详情页查看。",
          variant: "success",
        });
      } catch (error) {
        clearProgressTimer();
        setStatus("error");
        setCurrentStep((current) => Math.max(current, 1));
        const message = error instanceof Error ? error.message : "行程生成失败，请稍后重试。";
        setErrorMessage(message);
        toast({
          title: "生成失败",
          description: message,
          variant: "error",
        });
      }
    },
    [clearProgressTimer, params.tripId, sessionToken, toast]
  );

  useEffect(() => {
    if (loadingSession) return;
    if (!sessionToken) {
      setStatus("error");
      setErrorMessage("需要登录后才能生成行程，请先登录。");
      return;
    }
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    triggerGeneration(false);
  }, [loadingSession, sessionToken, triggerGeneration]);

  useEffect(() => {
    return () => {
      clearProgressTimer();
    };
  }, [clearProgressTimer]);

  const handleRetry = () => {
    triggerGeneration(true);
  };

  const handleViewTrip = () => {
    router.push(`/trips/${params.tripId}`);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <header className="space-y-3">
        <p className="text-sm text-primary/80">AI 行程生成中</p>
        <h1 className="text-3xl font-semibold">为你的旅行制定专属规划</h1>
        <p className="text-sm text-muted">
          系统将调用百炼大模型生成行程，再写入 Supabase 表。生成时间取决于网络与模型响应速度。
        </p>
      </header>

      {status === "pending" && (
        <div className="space-y-6 rounded-3xl border border-border bg-surface p-8 shadow-card">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-medium text-muted">
              <span>生成进度</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>

          <ol className="space-y-3 text-sm">
            {steps.map((step, index) => {
              const state =
                completedCount >= steps.length
                  ? "completed"
                  : index < completedCount
                    ? "completed"
                    : index === currentStep
                      ? "active"
                      : "pending";

              return (
                <li
                  key={step.key}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                    state === "completed"
                      ? "border-success/40 bg-success/10 text-success-foreground"
                      : state === "active"
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/80 bg-surface/60 text-muted"
                  }`}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-current text-sm font-medium">
                    {index + 1}
                  </span>
                  <span>{step.label}</span>
                  {state === "active" && <Spinner size="sm" className="ml-auto text-primary" />}
                  {state === "completed" && <span className="ml-auto text-xs">已完成</span>}
                </li>
              );
            })}
          </ol>

          <p className="text-xs text-muted">
            本步骤完成后，系统将自动跳转至详情页，方便你继续调整日程与预算。
          </p>
        </div>
      )}

      {status === "success" && result && (
        <SuccessPanel data={result} onViewTrip={handleViewTrip} onRegenerate={handleRetry} />
      )}

      {status === "error" && (
        <div className="space-y-4 rounded-3xl border border-destructive/40 bg-destructive/10 p-8 text-destructive">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">生成失败</h2>
            <p className="text-sm text-destructive">
              {errorMessage ?? "无法完成行程生成，请稍后重试。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="destructive" onClick={handleRetry}>
              重新尝试生成
            </Button>
            {!sessionToken ? (
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition hover:bg-surface/80"
              >
                前往登录
              </Link>
            ) : (
              <Link
                href="/planner/new"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition hover:bg-surface/80"
              >
                返回重新填写表单
              </Link>
            )}
          </div>
          <p className="text-xs text-destructive/80">
            若多次失败，请检查百炼 API Key、Supabase 权限或联系技术同事协助排查。
          </p>
        </div>
      )}
    </div>
  );
}

function SuccessPanel({
  data,
  onViewTrip,
  onRegenerate,
}: {
  data: GenerationResponse;
  onViewTrip: () => void;
  onRegenerate: () => void;
}) {
  const { plan, attempts, usage } = data;
  const totalBudget = plan.budget?.total ?? null;
  const primaryBudgetCategory = plan.budget?.breakdown?.[0];
  const firstDay = plan.days?.[0];

  return (
    <div className="space-y-6 rounded-3xl border border-border bg-surface p-8 shadow-card">
      <header className="space-y-2">
        <p className="text-sm text-success">生成完成</p>
        <h2 className="text-2xl font-semibold">{plan.overview.title}</h2>
        <p className="text-sm text-muted">{plan.overview.summary}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard label="目的地" value={plan.overview.destination} />
        <StatsCard label="行程天数" value={`${plan.overview.totalDays} 天`} />
        <StatsCard
          label="预算概览"
          value={totalBudget !== null ? `约 ¥${Math.round(totalBudget)}` : "等待后续完善"}
          description={
            primaryBudgetCategory
              ? `${primaryBudgetCategory.category} ≈ ¥${Math.round(primaryBudgetCategory.amount)}`
              : undefined
          }
        />
      </div>

      {firstDay && (
        <section className="space-y-3 rounded-2xl border border-border/60 bg-surface/60 p-5">
          <h3 className="text-sm font-medium text-muted">
            首日亮点 · {firstDay.date} · {firstDay.title}
          </h3>
          <ul className="space-y-2 text-sm text-foreground/80">
            {firstDay.activities.slice(0, 3).map((activity) => (
              <li key={activity.name} className="flex items-start gap-2">
                <span className="mt-1 inline-flex h-1.5 w-1.5 flex-none rounded-full bg-primary" />
                <span>
                  <span className="font-medium text-foreground">{activity.name}</span>
                  {activity.summary && <span className="text-muted"> · {activity.summary}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-dashed border-border/70 bg-surface/50 p-5 text-xs text-muted">
        <p>本次生成尝试次数：{attempts}</p>
        {usage?.totalTokens && (
          <p>
            Token 消耗：Prompt {usage.promptTokens ?? "-"} / Completion{" "}
            {usage.completionTokens ?? "-"} / Total {usage.totalTokens}
          </p>
        )}
        <p>如需重新生成，可点击下方按钮再次触发（将覆盖当前 LLM 生成内容）。</p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button onClick={onViewTrip}>查看行程详情</Button>
        <Button variant="secondary" onClick={onRegenerate}>
          重新生成
        </Button>
        <Link
          href="/trips"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-transparent px-4 text-sm font-medium text-foreground transition hover:bg-surface"
        >
          返回我的行程
        </Link>
      </div>

      <p className="text-xs text-muted">
        提示：详情页将在下一步任务中完善，目前可先在 Supabase 表中查看生成的数据。
      </p>
    </div>
  );
}

function StatsCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface/60 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
      {description && <p className="mt-1 text-xs text-muted">{description}</p>}
    </div>
  );
}
