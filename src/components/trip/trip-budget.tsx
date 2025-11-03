"use client";

import { cn } from "@/lib/utils";

type BudgetCategory = {
  category: string;
  amount: number;
  percentage: number;
  description?: string;
};

export type NormalizedBudget = {
  currency: string;
  total: number;
  breakdown: BudgetCategory[];
  tips: string[];
};

type TripBudgetSummaryProps = {
  budget: NormalizedBudget | null;
  plannedBudget: number | null;
  currencyFallback?: string;
};

export function TripBudgetSummary({
  budget,
  plannedBudget,
  currencyFallback = "CNY",
}: TripBudgetSummaryProps) {
  if (!budget && plannedBudget === null) {
    return null;
  }

  const currency = budget?.currency ?? currencyFallback;
  const total = budget?.total ?? null;
  const canCompare = plannedBudget !== null && total !== null;
  const comparisonDelta = canCompare ? plannedBudget! - total! : 0;
  const overBudget = canCompare && comparisonDelta < 0;

  let pillLabel: string | null = null;
  let pillClass = "bg-primary/10 text-primary";
  if (canCompare) {
    pillLabel = overBudget
      ? `预计超出 ${formatMoney(Math.abs(comparisonDelta), currency)}`
      : `预计剩余 ${formatMoney(comparisonDelta, currency)}`;
    pillClass = overBudget ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-600";
  } else if (plannedBudget !== null) {
    pillLabel = `行程预算 ${formatMoney(plannedBudget, currency)}`;
  }

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-card">
      <header className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">预算概览</h2>
          <p className="text-sm text-muted">
            基于 LLM 输出的预算建议，结合行程设定，展示主要支出类别与剩余空间。
          </p>
        </div>
        {pillLabel && (
          <div className={cn("rounded-full px-3 py-1 text-xs font-medium", pillClass)}>
            {pillLabel}
          </div>
        )}
      </header>

      <div className="grid gap-6 md:grid-cols-[minmax(0,220px)_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">LLM 预计总支出</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {total !== null ? formatMoney(total, currency) : "暂无数据"}
            </p>
            {budget?.tips.length ? (
              <p className="mt-2 text-xs text-muted">
                提示：{budget.tips[0]}
                {budget.tips.length > 1 ? " 等" : ""}
              </p>
            ) : null}
          </div>

          {plannedBudget !== null && (
            <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                行程设定预算
              </p>
              <p className="mt-2 text-lg font-semibold text-primary">
                {formatMoney(plannedBudget, currency)}
              </p>
              {total !== null && plannedBudget > 0 && (
                <p className="mt-1 text-xs text-muted">
                  已使用约 {Math.min(100, Math.round((total / plannedBudget) * 100))}%（含 LLM
                  估算）
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {budget && budget.breakdown.length > 0 ? (
            <ul className="space-y-4">
              {budget.breakdown.map((item) => {
                const share = clampPercentage(item.percentage);
                return (
                  <li
                    key={item.category}
                    className="space-y-2 rounded-2xl border border-border/60 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-foreground">{item.category}</div>
                      <div className="text-sm font-semibold text-foreground">
                        {formatMoney(item.amount, currency)}{" "}
                        <span className="ml-1 text-xs font-normal text-muted">({share}%)</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted/30">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    {item.description && (
                      <p className="text-xs leading-relaxed text-muted">{item.description}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-background/40 p-6 text-sm text-muted">
              LLM 尚未提供分类预算，建议重新生成行程或手动补充支出估算。
            </div>
          )}

          {budget && budget.tips.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">节约建议</p>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                {budget.tips.map((tip, index) => (
                  <li key={`${tip}-${index}`}>· {tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatMoney(amount: number, currency: string) {
  if (!Number.isFinite(amount)) return "-";
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 1000 ? 0 : 1,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}
