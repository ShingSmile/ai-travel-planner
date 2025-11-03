"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

type ExpenseItem = {
  id: string;
  category: string;
  amount: number;
  currency: string;
  source: string | null;
  memo: string | null;
  createdAt: string;
};

type ExpenseSummary = {
  currency: string;
  total: number;
  categories: Array<{
    category: string;
    total: number;
    percentage: number;
  }>;
};

type TripExpensesPanelProps = {
  tripId: string;
  sessionToken: string | null;
  currencyFallback?: string;
};

type FormState = {
  category: string;
  amount: string;
  currency: string;
  source: string;
  memo: string;
};

export function TripExpensesPanel({
  tripId,
  sessionToken,
  currencyFallback = "CNY",
}: TripExpensesPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("全部");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    category: "",
    amount: "",
    currency: "",
    source: "",
    memo: "",
  });

  const categories = useMemo(() => {
    const base = summary?.categories.map((item) => item.category) ?? [];
    const extra = expenses.map((item) => item.category).filter((item) => !base.includes(item));
    return ["全部", ...new Set([...base, ...extra])];
  }, [summary, expenses]);

  const filteredExpenses = useMemo(() => {
    if (activeCategory === "全部") return expenses;
    return expenses.filter((item) => item.category === activeCategory);
  }, [activeCategory, expenses]);

  const currency = summary?.currency ?? (form.currency || currencyFallback);

  const fetchExpenses = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setFetchError(null);
    try {
      const response = await fetch(`/api/expenses?tripId=${tripId}`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
        cache: "no-store",
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message ?? "获取费用记录失败，请稍后重试。");
      }

      setExpenses(payload.data.expenses as ExpenseItem[]);
      setSummary(payload.data.summary as ExpenseSummary);
    } catch (error) {
      console.error("[TripExpenses] fetch error:", error);
      const message = error instanceof Error ? error.message : "获取费用记录失败，请稍后重试。";
      setFetchError(message);
      setExpenses([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, tripId]);

  useEffect(() => {
    if (!sessionToken) return;
    fetchExpenses();
  }, [sessionToken, fetchExpenses]);

  const handleFormChange = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!sessionToken) {
      toast({
        title: "尚未登录",
        description: "请先登录后再记录费用。",
        variant: "warning",
      });
      return;
    }

    const amount = Number.parseFloat(form.amount);
    if (!form.category.trim()) {
      toast({
        title: "类别不能为空",
        description: "请填写费用类别，例如餐饮、交通。",
        variant: "warning",
      });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "金额不合法",
        description: "请填写大于 0 的金额，例如 128.5。",
        variant: "warning",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          tripId,
          category: form.category.trim(),
          amount,
          currency: form.currency.trim() || currencyFallback,
          source: form.source.trim() || undefined,
          memo: form.memo.trim() || undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message ?? "新增费用失败，请稍后重试。");
      }

      handleFormChange({
        amount: "",
        source: "",
        memo: "",
      });
      toast({
        title: "已记录费用",
        description: "新的支出已保存。",
        variant: "success",
      });
      await fetchExpenses();
    } catch (error) {
      console.error("[TripExpenses] create expense error:", error);
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "新增费用失败，请稍后重试。",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessionToken) {
    return (
      <section className="space-y-4 rounded-3xl border border-border bg-surface p-6 text-center shadow-card">
        <h2 className="text-lg font-semibold text-foreground">费用记录</h2>
        <p className="text-sm text-muted">登录后可记录和查看行程支出。</p>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-card">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">费用记录</h2>
          <p className="text-sm text-muted">
            汇总每日支出，掌握预算使用情况。可按照类别筛选，或快速新增一笔费用。
          </p>
        </div>
        <select
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          value={activeCategory}
          onChange={(event) => setActiveCategory(event.target.value)}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </header>

      {loading ? (
        <div className="flex h-32 items-center justify-center gap-3">
          <Spinner />
          <span className="text-sm text-muted">正在加载费用数据...</span>
        </div>
      ) : fetchError ? (
        <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
          <p className="font-medium text-destructive">加载费用失败</p>
          <p className="text-muted">{fetchError}</p>
          <Button size="sm" variant="secondary" onClick={fetchExpenses}>
            重试加载
          </Button>
        </div>
      ) : (
        <>
          <ExpenseSummaryCards summary={summary} currency={currency} />
          <ExpenseTable expenses={filteredExpenses} currency={currency} />
        </>
      )}

      <form
        className="space-y-4 rounded-2xl border border-border/80 bg-background/40 p-5"
        onSubmit={handleSubmit}
      >
        <h3 className="text-sm font-semibold text-foreground">快速新增费用</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="费用类别"
            placeholder="餐饮 / 住宿 / 交通..."
            value={form.category}
            onChange={(event) => handleFormChange({ category: event.target.value })}
            required
          />
          <Input
            label="金额"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="例如 128.50"
            value={form.amount}
            onChange={(event) => handleFormChange({ amount: event.target.value })}
            required
          />
          <Input
            label="币种（可选）"
            placeholder={currencyFallback}
            value={form.currency}
            onChange={(event) => handleFormChange({ currency: event.target.value })}
          />
          <Input
            label="来源（可选）"
            placeholder="如 微信支付 / 现金"
            value={form.source}
            onChange={(event) => handleFormChange({ source: event.target.value })}
          />
        </div>
        <TextArea
          label="备注（可选）"
          placeholder="可记录同行人、票据号等补充信息"
          value={form.memo}
          onChange={(event) => handleFormChange({ memo: event.target.value })}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner size="sm" />
                提交中...
              </>
            ) : (
              "保存费用"
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ExpenseSummaryCards({
  summary,
  currency,
}: {
  summary: ExpenseSummary | null;
  currency: string;
}) {
  if (!summary) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-background/40 p-6 text-sm text-muted">
        尚未记录任何支出，快来添加第一笔费用吧。
      </div>
    );
  }

  const { total, categories } = summary;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_1fr]">
      <div className="rounded-2xl border border-border/70 bg-background/40 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">累计支出</p>
        <p className="mt-2 text-2xl font-semibold text-foreground">
          {formatMoney(total, currency)}
        </p>
        <p className="mt-1 text-xs text-muted">
          {categories.length > 0
            ? `最高支出类别：${categories[0]?.category ?? ""}`
            : "尚无分类统计"}
        </p>
      </div>
      <div className="space-y-3 rounded-2xl border border-border/70 bg-background/40 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">按类别统计</p>
        <ul className="space-y-3">
          {categories.length === 0 ? (
            <li className="text-xs text-muted">暂无分类记录。</li>
          ) : (
            categories.map((item) => (
              <li key={item.category} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm text-foreground">
                  <span>{item.category}</span>
                  <span className="font-medium">
                    {formatMoney(item.total, currency)}{" "}
                    <span className="ml-1 text-xs font-normal text-muted">
                      ({Math.round(item.percentage)}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted/30">
                  <div
                    className="h-full rounded-full bg-primary/80 transition-all"
                    style={{ width: `${Math.min(100, Math.round(item.percentage))}%` }}
                  />
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function ExpenseTable({ expenses, currency }: { expenses: ExpenseItem[]; currency: string }) {
  if (expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-background/40 p-6 text-sm text-muted">
        当前筛选下暂无费用记录。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70">
      <div className="grid grid-cols-[minmax(0,160px)_minmax(0,120px)_minmax(0,120px)_minmax(0,160px)_minmax(0,200px)] bg-muted/30 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted max-md:hidden">
        <span>记录时间</span>
        <span>类别</span>
        <span>金额</span>
        <span>来源</span>
        <span>备注</span>
      </div>
      <ul className="divide-y divide-border/70">
        {expenses.map((expense) => (
          <li
            key={expense.id}
            className="grid grid-cols-1 gap-3 px-4 py-4 text-sm text-foreground md:grid-cols-[minmax(0,160px)_minmax(0,120px)_minmax(0,120px)_minmax(0,160px)_minmax(0,200px)] md:items-center"
          >
            <span className="text-xs text-muted">
              {new Intl.DateTimeFormat("zh-CN", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(expense.createdAt))}
            </span>
            <span className="font-medium">{expense.category}</span>
            <span className="font-semibold text-foreground">
              {formatMoney(expense.amount, expense.currency || currency)}
            </span>
            <span className="text-xs text-muted">{expense.source ?? "—"}</span>
            <span className="text-xs text-muted leading-relaxed">
              {expense.memo && expense.memo.trim() ? expense.memo : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
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
