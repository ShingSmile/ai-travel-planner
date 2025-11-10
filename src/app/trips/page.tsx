"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { getSupabaseClient } from "@/lib/supabase-client";
import { getPlaywrightBypassToken } from "@/lib/test-flags";
import { cn } from "@/lib/utils";

type TripStatus = "draft" | "generating" | "ready" | "archived";

type TripListItem = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  budget: string | number | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
};

const statusOptions: Array<{ value: "all" | TripStatus; label: string }> = [
  { value: "all", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "generating", label: "生成中" },
  { value: "ready", label: "已生成" },
  { value: "archived", label: "已归档" },
];

const statusLabel: Record<TripStatus, string> = {
  draft: "草稿",
  generating: "生成中",
  ready: "已生成",
  archived: "已归档",
};

const statusBadgeStyles: Record<TripStatus, string> = {
  draft: "bg-amber-100 text-amber-700",
  generating: "bg-sky-100 text-sky-700",
  ready: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-100 text-slate-600",
};

const validStatuses: TripStatus[] = ["draft", "generating", "ready", "archived"];

export default function TripsPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const bypassToken = useMemo(() => getPlaywrightBypassToken(), []);
  const { toast } = useToast();

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | TripStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (bypassToken) {
      setSessionToken(bypassToken);
      setLoadingSession(false);
      return;
    }

    if (!supabase) {
      setSessionToken(null);
      setLoadingSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSessionToken(data.session?.access_token ?? null);
      setLoadingSession(false);
    });
  }, [supabase, bypassToken]);

  const effectiveToken = sessionToken ?? bypassToken;

  const fetchTrips = useCallback(async () => {
    if (!effectiveToken) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      const response = await fetch(`/api/trips?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${effectiveToken}`,
        },
        cache: "no-store",
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message ?? "获取行程列表失败，请稍后重试。");
      }

      const records = (payload.data.trips as Array<Record<string, unknown>>).map<TripListItem>(
        (item) => ({
          id: String(item.id),
          title: String(item.title ?? "未命名行程"),
          destination: String(item.destination ?? "目的地待定"),
          startDate: String(item.start_date ?? ""),
          endDate: String(item.end_date ?? ""),
          status:
            typeof item.status === "string" && validStatuses.includes(item.status as TripStatus)
              ? (item.status as TripStatus)
              : "draft",
          budget: (item.budget as string | number | null) ?? null,
          tags: Array.isArray(item.tags) ? (item.tags as string[]) : null,
          createdAt: String(item.created_at ?? new Date().toISOString()),
          updatedAt: String(item.updated_at ?? item.created_at ?? new Date().toISOString()),
        })
      );

      setTrips(records);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "获取行程列表失败，请稍后重试。";
      setError(message);
      toast({
        title: "加载行程失败",
        description: message,
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [effectiveToken, statusFilter, toast]);

  useEffect(() => {
    if (loadingSession) return;
    if (!effectiveToken) return;
    void fetchTrips();
  }, [fetchTrips, loadingSession, effectiveToken]);

  const handleDeleteTrip = useCallback(
    async (tripId: string, tripTitle: string) => {
      if (!effectiveToken) return;

      const confirmed = window.confirm(`确定要删除行程「${tripTitle}」吗？此操作不可撤销。`);
      if (!confirmed) return;

      setDeletingId(tripId);
      try {
        const response = await fetch(`/api/trips/${tripId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
          },
        });

        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error?.message ?? "删除行程失败，请稍后重试。");
        }

        setTrips((prev) => prev.filter((trip) => trip.id !== tripId));
        toast({
          title: "行程已删除",
          description: `「${tripTitle}」已从列表移除。`,
          variant: "success",
        });
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "删除行程失败，请稍后重试。";
        toast({
          title: "删除失败",
          description: message,
          variant: "error",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [effectiveToken, toast]
  );

  const filteredTrips = useMemo(() => {
    const normalizedKeyword = searchTerm.trim().toLowerCase();
    const sorted = [...trips].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (!normalizedKeyword) {
      return sorted;
    }

    return sorted.filter((trip) => {
      const haystack = [trip.title, trip.destination, ...(trip.tags ?? [])].join(" ").toLowerCase();

      return haystack.includes(normalizedKeyword);
    });
  }, [trips, searchTerm]);

  if (!effectiveToken && !loadingSession) {
    return (
      <section className="space-y-6 rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
        <h1 className="text-2xl font-semibold text-foreground">我的行程</h1>
        <p className="text-sm text-muted">请登录后查看和管理你的旅行计划。</p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            前往登录
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 items-center rounded-xl border border-border px-6 text-sm font-medium text-foreground transition hover:bg-surface/60"
          >
            注册体验
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">我的行程</h1>
          <p className="mt-1 text-sm text-muted">
            管理所有旅行计划，查看最新进度、预算概况，并快速跳转至详情或分享页面。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/planner/new"
            className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            新建行程
          </Link>
          <Button variant="secondary" onClick={() => fetchTrips()} disabled={loading}>
            {loading ? (
              <>
                <Spinner size="sm" />
                刷新中...
              </>
            ) : (
              "刷新列表"
            )}
          </Button>
        </div>
      </header>

      <section className="space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  statusFilter === option.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border text-muted hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="w-full max-w-xs">
            <Input
              placeholder="搜索标题或目的地..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-muted">
            <Spinner />
            正在加载行程列表...
          </div>
        ) : error ? (
          <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
            <p className="font-medium text-destructive">加载失败</p>
            <p className="text-muted">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => fetchTrips()}>
              重新加载
            </Button>
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-border bg-background/60 p-8 text-center text-sm text-muted">
            <p>尚无符合条件的行程。</p>
            <p>可以尝试调整筛选条件，或点击右上角「新建行程」开启新的旅程计划。</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredTrips.map((trip) => (
              <article
                key={trip.id}
                className="flex h-full flex-col justify-between gap-5 rounded-3xl border border-border bg-background/70 p-6 shadow-card transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                          statusBadgeStyles[trip.status]
                        )}
                      >
                        {statusLabel[trip.status]}
                      </div>
                      <h2 className="text-xl font-semibold text-foreground">{trip.title}</h2>
                    </div>
                    <div className="text-right text-xs text-muted">
                      更新 {formatRelativeTime(trip.updatedAt)}
                      <br />
                      创建 {formatRelativeTime(trip.createdAt)}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-muted">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground/90">{trip.destination}</span>
                      <span className="text-xs text-muted">
                        {formatDateRange(trip.startDate, trip.endDate)}
                      </span>
                    </div>
                    {trip.budget ? (
                      <p>
                        预估预算：{" "}
                        <span className="font-medium text-foreground">
                          {formatBudget(trip.budget)}
                        </span>
                      </p>
                    ) : (
                      <p>预估预算：待补充</p>
                    )}
                    {trip.tags && trip.tags.length > 0 ? (
                      <p className="text-xs text-muted">
                        标签：{trip.tags.map((tag) => `#${tag}`).join(" ")}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/trips/${trip.id}`}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                  >
                    查看详情
                  </Link>
                  {trip.status !== "archived" && (
                    <Link
                      href={`/trips/${trip.id}/share`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition hover:bg-surface/60"
                    >
                      分享
                    </Link>
                  )}
                  {trip.status === "draft" || trip.status === "generating" ? (
                    <Link
                      href={`/trips/${trip.id}/generate`}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-primary/60 px-4 text-sm font-medium text-primary transition hover:bg-primary/10"
                    >
                      继续生成
                    </Link>
                  ) : null}
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1 rounded-xl px-4 text-sm sm:flex-none h-10"
                    onClick={() => handleDeleteTrip(trip.id, trip.title)}
                    disabled={deletingId === trip.id}
                  >
                    {deletingId === trip.id ? (
                      <>
                        <Spinner size="sm" />
                        删除中...
                      </>
                    ) : (
                      "删除"
                    )}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatDateRange(start: string, end: string) {
  if (!start || !end) {
    return "日期待定";
  }

  try {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
    });
    return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
  } catch {
    return "日期待定";
  }
}

function formatBudget(budget: string | number | null) {
  if (budget === null || budget === undefined || budget === "") {
    return "待补充";
  }

  const numeric =
    typeof budget === "number"
      ? budget
      : Number.parseFloat(typeof budget === "string" ? budget : String(budget));

  if (!Number.isFinite(numeric)) {
    return "待补充";
  }

  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      maximumFractionDigits: numeric >= 1000 ? 0 : 1,
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(0)} CNY`;
  }
}

function formatRelativeTime(value: string) {
  try {
    const date = new Date(value);
    let duration = (date.getTime() - Date.now()) / 1000;

    const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
      { amount: 60, unit: "second" },
      { amount: 60, unit: "minute" },
      { amount: 24, unit: "hour" },
      { amount: 7, unit: "day" },
      { amount: 4.34524, unit: "week" },
      { amount: 12, unit: "month" },
      { amount: Number.POSITIVE_INFINITY, unit: "year" },
    ];

    for (const division of divisions) {
      if (Math.abs(duration) < division.amount) {
        const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
        return formatter.format(Math.round(duration), division.unit);
      }
      duration /= division.amount;
    }

    const fallbackFormatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
    return fallbackFormatter.format(Math.round(duration), "year");
  } catch {
    return "刚刚";
  }
}
