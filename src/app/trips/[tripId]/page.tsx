"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { getSupabaseClient } from "@/lib/supabase-client";
import { cn } from "@/lib/utils";
import { TripMap } from "@/components/trip/trip-map";
import { TripBudgetSummary, type NormalizedBudget } from "@/components/trip/trip-budget";
import { TripExpensesPanel } from "@/components/trip/trip-expenses";
import { getPlaywrightBypassToken } from "@/lib/test-flags";

type TripDetail = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  budget: string | number | null;
  budgetBreakdown: Record<string, unknown> | null;
  travelers: unknown[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  days: TripDay[];
};

type TripDay = {
  id: string;
  date: string;
  summary: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  activities: Activity[];
};

type Activity = {
  id: string;
  type: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  cost: string | null;
  currency: string | null;
  status: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type ActivityApiResponse = {
  id: string;
  type: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  cost: string | null;
  currency: string | null;
  status: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ActivityDraft = {
  startTime: string;
  endTime: string;
  note: string;
  saving: boolean;
  deleting: boolean;
};

type BudgetSummary = NormalizedBudget;

const statusLabel: Record<string, string> = {
  draft: "草稿",
  generating: "生成中",
  ready: "已生成",
  archived: "已归档",
};

const activityTypeLabel: Record<string, string> = {
  transport: "交通安排",
  attraction: "景点/活动",
  dining: "餐饮",
  hotel: "住宿",
  shopping: "购物",
  accommodation: "住宿",
};

export default function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const supabase = useMemo(() => getSupabaseClient(), []);
  const bypassToken = useMemo(() => getPlaywrightBypassToken(), []);
  const { toast } = useToast();

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activityDrafts, setActivityDrafts] = useState<Record<string, ActivityDraft>>({});
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [tripReminder, setTripReminder] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const budgetSummary = useMemo(
    () => normalizeBudgetBreakdown(trip?.budgetBreakdown ?? null),
    [trip?.budgetBreakdown]
  );
  const plannedBudgetAmount = useMemo(
    () => parseBudgetAmount(trip?.budget ?? null),
    [trip?.budget]
  );
  const currencyFallback = budgetSummary?.currency ?? "CNY";

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

  const fetchTripDetails = useCallback(async () => {
    const token = sessionToken ?? bypassToken;
    if (!token) return;
    setLoadingTrip(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/trips/${tripId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message ?? "获取行程详情失败，请稍后重试。");
      }

      const nextTrip = payload.data.trip as TripDetail;
      setTrip(nextTrip);
    } catch (error) {
      console.error("[trip detail] fetch error:", error);
      const message = error instanceof Error ? error.message : "获取行程详情失败，请稍后重试。";
      setLoadError(message);
      setTrip(null);
      toast({
        title: "加载失败",
        description: message,
        variant: "error",
      });
    } finally {
      setLoadingTrip(false);
    }
  }, [tripId, sessionToken, toast, bypassToken]);

  useEffect(() => {
    if (loadingSession) return;
    if (!sessionToken) return;
    fetchTripDetails();
  }, [fetchTripDetails, loadingSession, sessionToken]);

  useEffect(() => {
    if (!trip) {
      setShareUrl(null);
      return;
    }
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    setShareUrl(`${origin}/trips/${trip.id}/share`);
  }, [trip]);

  useEffect(() => {
    if (!trip) {
      setTripReminder(null);
      return;
    }

    const startDate = new Date(trip.startDate);
    if (Number.isNaN(startDate.getTime())) {
      setTripReminder(null);
      return;
    }

    const now = new Date();
    const diffMs = startDate.getTime() - now.getTime();
    if (diffMs <= 0 || diffMs > 24 * 60 * 60 * 1000) {
      setTripReminder(null);
      return;
    }

    const hours = Math.max(1, Math.round(diffMs / (60 * 60 * 1000)));
    setTripReminder(`行程将在 ${hours} 小时后开始，请确认交通与住宿等关键事项。`);
  }, [trip]);

  useEffect(() => {
    if (!sessionToken || !trip || !supabase || bypassToken) return;

    const dayIds = new Set(trip.days.map((day) => day.id));
    if (dayIds.size === 0) return;

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimeout) return;
      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        fetchTripDetails();
      }, 200);
    };

    const channel = supabase!
      .channel(`trip-${trip.id}-activities`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activities",
        },
        (payload) => {
          const newRow = payload.new as { trip_day_id?: string } | null;
          const oldRow = payload.old as { trip_day_id?: string } | null;
          const affectedDayId = newRow?.trip_day_id ?? oldRow?.trip_day_id ?? null;
          if (!affectedDayId || !dayIds.has(affectedDayId)) {
            return;
          }
          scheduleRefresh();
        }
      )
      .subscribe();

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      supabase!.removeChannel(channel);
    };
  }, [supabase, trip, sessionToken, fetchTripDetails, bypassToken]);

  useEffect(() => {
    if (!trip) {
      setActivityDrafts({});
      setSelectedActivityId(null);
      return;
    }

    setActivityDrafts((prev) => {
      const next: Record<string, ActivityDraft> = {};
      trip.days.forEach((day) => {
        day.activities.forEach((activity) => {
          const existing = prev[activity.id];
          next[activity.id] = existing
            ? { ...existing, saving: false, deleting: false }
            : createDraftFromActivity(activity);
        });
      });
      return next;
    });

    setSelectedActivityId((current) => {
      if (
        current &&
        trip.days.some((day) => day.activities.some((activity) => activity.id === current))
      ) {
        return current;
      }
      const firstActivityWithLocation = trip.days
        .flatMap((day) => day.activities)
        .find((activity) =>
          Boolean(activity.location || extractCoordinatesFromDetails(activity.details))
        );
      return firstActivityWithLocation?.id ?? null;
    });
  }, [trip]);

  const handleDraftChange = (
    activity: Activity,
    patch: Partial<Pick<ActivityDraft, "startTime" | "endTime" | "note">>
  ) => {
    setActivityDrafts((prev) => ({
      ...prev,
      [activity.id]: {
        ...(prev[activity.id] ?? createDraftFromActivity(activity)),
        ...patch,
      },
    }));
  };

  const handleReset = (activity: Activity) => {
    setActivityDrafts((prev) => ({
      ...prev,
      [activity.id]: createDraftFromActivity(activity),
    }));
  };

  const handleSave = async (activity: Activity, dayId: string) => {
    if (!sessionToken) {
      toast({
        title: "尚未登录",
        description: "请先登录后再编辑行程活动。",
        variant: "warning",
      });
      return;
    }

    const draft = activityDrafts[activity.id] ?? createDraftFromActivity(activity);
    const baselineStart = formatDatetimeLocal(activity.startTime);
    const baselineEnd = formatDatetimeLocal(activity.endTime);
    const baselineNote = getActivityNote(activity);

    const payload: Record<string, string | null> = {};

    if (draft.startTime !== baselineStart) {
      if (draft.startTime) {
        const iso = toIsoString(draft.startTime);
        if (!iso) {
          toast({
            title: "时间格式错误",
            description: "请使用有效的日期时间格式，例如 2024-05-20T09:30。",
            variant: "warning",
          });
          return;
        }
        payload.startTime = iso;
      } else {
        payload.startTime = null;
      }
    }

    if (draft.endTime !== baselineEnd) {
      if (draft.endTime) {
        const iso = toIsoString(draft.endTime);
        if (!iso) {
          toast({
            title: "时间格式错误",
            description: "请使用有效的日期时间格式，例如 2024-05-20T18:00。",
            variant: "warning",
          });
          return;
        }
        payload.endTime = iso;
      } else {
        payload.endTime = null;
      }
    }

    if (draft.note !== baselineNote) {
      const trimmed = draft.note.trim();
      payload.note = trimmed ? trimmed : null;
    }

    if (Object.keys(payload).length === 0) {
      toast({
        title: "无需保存",
        description: "当前没有修改内容。",
        variant: "info",
      });
      return;
    }

    setActivityDrafts((prev) => ({
      ...prev,
      [activity.id]: {
        ...prev[activity.id],
        saving: true,
      },
    }));

    try {
      const response = await fetch(`/api/activities/${activity.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message ?? "更新活动失败，请稍后重试。");
      }

      const updated = transformActivityRow(result.data.activity as ActivityApiResponse);

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) => {
            if (day.id !== dayId) return day;
            return {
              ...day,
              activities: day.activities.map((item) => (item.id === activity.id ? updated : item)),
            };
          }),
        };
      });

      setActivityDrafts((prev) => ({
        ...prev,
        [activity.id]: createDraftFromActivity(updated),
      }));

      toast({
        title: "保存成功",
        description: "活动已更新。",
        variant: "success",
      });
    } catch (error) {
      console.error("[trip detail] update activity error:", error);
      toast({
        title: "保存失败",
        description: error instanceof Error ? error.message : "更新活动失败，请稍后重试。",
        variant: "error",
      });
      setActivityDrafts((prev) => ({
        ...prev,
        [activity.id]: {
          ...(prev[activity.id] ?? createDraftFromActivity(activity)),
          saving: false,
        },
      }));
    }
  };

  const handleDelete = async (activity: Activity, dayId: string) => {
    if (!sessionToken) {
      toast({
        title: "尚未登录",
        description: "请先登录后再删除活动。",
        variant: "warning",
      });
      return;
    }

    const confirmDelete = window.confirm("确定要删除该活动吗？删除后不可恢复。");
    if (!confirmDelete) return;

    setActivityDrafts((prev) => ({
      ...prev,
      [activity.id]: {
        ...(prev[activity.id] ?? createDraftFromActivity(activity)),
        deleting: true,
      },
    }));

    try {
      const response = await fetch(`/api/activities/${activity.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error?.message ?? "删除活动失败，请稍后重试。");
      }

      setTrip((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) => {
            if (day.id !== dayId) return day;
            return {
              ...day,
              activities: day.activities.filter((item) => item.id !== activity.id),
            };
          }),
        };
      });

      setActivityDrafts((prev) => {
        const next = { ...prev };
        delete next[activity.id];
        return next;
      });

      toast({
        title: "已删除活动",
        description: "该活动已从行程中移除。",
        variant: "success",
      });
    } catch (error) {
      console.error("[trip detail] delete activity error:", error);
      toast({
        title: "删除失败",
        description: error instanceof Error ? error.message : "删除活动失败，请稍后重试。",
        variant: "error",
      });
      setActivityDrafts((prev) => ({
        ...prev,
        [activity.id]: {
          ...(prev[activity.id] ?? createDraftFromActivity(activity)),
          deleting: false,
        },
      }));
    }
  };

  if (loadingSession || (loadingTrip && !loadError && sessionToken)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-muted">正在加载行程详情，请稍候...</p>
      </div>
    );
  }

  if (!sessionToken && !loadingSession) {
    return (
      <div className="space-y-4 rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
        <h1 className="text-2xl font-semibold">需要登录</h1>
        <p className="text-sm text-muted">请登录账户后查看行程详情。</p>
        <div className="flex justify-center gap-3">
          <Link href="/(auth)/login">
            <Button>前往登录</Button>
          </Link>
          <Link href="/(auth)/register">
            <Button variant="secondary">注册新账户</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4 rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
        <h1 className="text-2xl font-semibold">无法加载行程</h1>
        <p className="text-sm text-muted">{loadError}</p>
        <Button onClick={fetchTripDetails}>重试加载</Button>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="space-y-4 rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
        <h1 className="text-2xl font-semibold">未找到行程</h1>
        <p className="text-sm text-muted">行程可能已被删除，或你无权访问该内容。</p>
        <Link href="/planner/new">
          <Button>创建新行程</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {tripReminder && (
        <div className="flex flex-col gap-3 rounded-3xl border border-primary/40 bg-primary/10 p-5 text-sm text-primary md:flex-row md:items-center md:justify-between">
          <p>{tripReminder}</p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start text-primary md:self-center"
            onClick={() => setTripReminder(null)}
          >
            已确认
          </Button>
        </div>
      )}
      <header className="space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-foreground">{trip.title}</h1>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium text-foreground",
              trip.status === "ready"
                ? "bg-emerald-100 text-emerald-700"
                : trip.status === "generating"
                  ? "bg-amber-100 text-amber-700"
                  : trip.status === "archived"
                    ? "bg-slate-200 text-slate-600"
                    : "bg-primary/10 text-primary"
            )}
          >
            {statusLabel[trip.status] ?? trip.status}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
          <div>{formatDateRange(trip.startDate, trip.endDate)}</div>
          <div>目的地：{trip.destination}</div>
          <div>预算：{formatBudget(trip.budget)}</div>
        </div>

        {trip.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {trip.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border/60 bg-background px-3 py-1 text-muted"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link href={`/trips/${trip.id}/generate`}>
            <Button variant="secondary">重新生成行程</Button>
          </Link>
          <Link href="/planner/new">
            <Button variant="ghost">创建新行程</Button>
          </Link>
          {shareUrl && (
            <>
              <Button type="button" variant="ghost" onClick={() => window.open(shareUrl, "_blank")}>
                打开分享页
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    toast({
                      title: "已复制分享链接",
                      description: "将链接发给伙伴即可查看行程概览。",
                      variant: "success",
                    });
                  } catch {
                    toast({
                      title: "复制失败",
                      description: "请手动复制浏览器地址栏中的分享链接。",
                      variant: "warning",
                    });
                  }
                }}
              >
                复制分享链接
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => window.open(`${shareUrl}?print=1`, "_blank")}
              >
                导出为 PDF
              </Button>
            </>
          )}
        </div>
      </header>

      <section className="space-y-6">
        <TripBudgetSummary
          budget={budgetSummary}
          plannedBudget={plannedBudgetAmount}
          currencyFallback={currencyFallback}
        />

        <TripExpensesPanel
          tripId={trip.id}
          sessionToken={sessionToken}
          currencyFallback={currencyFallback}
          plannedBudget={plannedBudgetAmount}
        />

        <div className="space-y-4">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">行程地图</h2>
            <p className="text-xs text-muted">点击地图或活动卡片可高亮对应点位。</p>
          </header>
          <TripMap
            days={trip.days}
            selectedActivityId={selectedActivityId}
            onActivitySelect={setSelectedActivityId}
          />
        </div>

        {trip.days.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
            尚未生成每日行程内容，可前往生成页面重新尝试。
          </div>
        ) : (
          trip.days.map((day, index) => (
            <article
              key={day.id}
              className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-card"
            >
              <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">
                    第 {index + 1} 天 · {formatDayDate(day.date)}
                  </p>
                  <h2 className="text-xl font-semibold text-foreground">
                    {day.summary ?? "待补充的行程摘要"}
                  </h2>
                </div>
                {day.notes && (
                  <p className="max-w-xl text-sm text-muted md:text-right">备注：{day.notes}</p>
                )}
              </header>

              <div className="space-y-4">
                {day.activities.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-background/60 p-6 text-sm text-muted">
                    暂无活动，可手动添加或重新生成。
                  </div>
                ) : (
                  day.activities.map((activity) => {
                    const draft = activityDrafts[activity.id] ?? createDraftFromActivity(activity);
                    const baselineStart = formatDatetimeLocal(activity.startTime);
                    const baselineEnd = formatDatetimeLocal(activity.endTime);
                    const baselineNote = getActivityNote(activity);
                    const isDirty =
                      draft.startTime !== baselineStart ||
                      draft.endTime !== baselineEnd ||
                      draft.note !== baselineNote;
                    const isSelected = selectedActivityId === activity.id;

                    return (
                      <div
                        key={activity.id}
                        className={cn(
                          "space-y-4 rounded-2xl border border-border bg-background/40 p-5 shadow-card outline-none transition hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 focus-visible:border-primary focus-visible:shadow-lg focus-visible:shadow-primary/20",
                          isSelected && "border-primary/70 shadow-lg shadow-primary/20"
                        )}
                        tabIndex={0}
                        onMouseEnter={() => setSelectedActivityId(activity.id)}
                        onMouseDown={() => setSelectedActivityId(activity.id)}
                        onFocus={() => setSelectedActivityId(activity.id)}
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted">
                              {formatTimeRange(activity.startTime, activity.endTime)}
                            </p>
                            <h3 className="text-lg font-semibold text-foreground">
                              {activity.location ??
                                activityTypeLabel[activity.type] ??
                                activity.type}
                            </h3>
                            <p className="text-xs text-muted">
                              类型：{activityTypeLabel[activity.type] ?? activity.type}
                              {activity.cost
                                ? ` · 预计费用 ${formatCost(activity.cost, activity.currency)}`
                                : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleReset(activity)}
                              disabled={!isDirty || draft.saving || draft.deleting}
                            >
                              重置
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSave(activity, day.id)}
                              disabled={!isDirty || draft.deleting}
                            >
                              {draft.saving ? (
                                <>
                                  <Spinner size="sm" />
                                  保存中...
                                </>
                              ) : (
                                "保存修改"
                              )}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(activity, day.id)}
                              disabled={draft.saving || draft.deleting}
                            >
                              {draft.deleting ? (
                                <>
                                  <Spinner size="sm" />
                                  删除中...
                                </>
                              ) : (
                                "删除"
                              )}
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <Input
                            type="datetime-local"
                            label="开始时间"
                            value={draft.startTime}
                            onChange={(event) =>
                              handleDraftChange(activity, { startTime: event.target.value })
                            }
                          />
                          <Input
                            type="datetime-local"
                            label="结束时间"
                            value={draft.endTime}
                            onChange={(event) =>
                              handleDraftChange(activity, { endTime: event.target.value })
                            }
                          />
                        </div>

                        <TextArea
                          label="活动备注"
                          placeholder="可记录交通方式、必备物品或其它注意事项"
                          value={draft.note}
                          onChange={(event) =>
                            handleDraftChange(activity, { note: event.target.value })
                          }
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function createDraftFromActivity(activity: Activity): ActivityDraft {
  return {
    startTime: formatDatetimeLocal(activity.startTime),
    endTime: formatDatetimeLocal(activity.endTime),
    note: getActivityNote(activity),
    saving: false,
    deleting: false,
  };
}

function transformActivityRow(raw: ActivityApiResponse): Activity {
  return {
    id: raw.id,
    type: raw.type,
    startTime: raw.start_time,
    endTime: raw.end_time,
    location: raw.location,
    cost: raw.cost,
    currency: raw.currency,
    status: raw.status ?? "planned",
    details: raw.details,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function getActivityNote(activity: Activity) {
  const details = activity.details;
  if (!details || typeof details !== "object") return "";
  const note = (details as Record<string, unknown>).notes;
  return typeof note === "string" ? note : "";
}

function formatBudget(budget: TripDetail["budget"]) {
  if (budget === null || budget === undefined) return "未设置";
  const amount = typeof budget === "string" ? Number.parseFloat(budget) : budget;
  if (Number.isNaN(amount)) return String(budget);
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCost(cost: string | null, currency: string | null) {
  if (!cost) return "";
  const amount = Number.parseFloat(cost);
  if (Number.isNaN(amount)) return cost;
  const unit = currency ?? "CNY";
  return `${amount.toFixed(0)} ${unit}`;
}

function formatDateRange(start: string, end: string) {
  const startDate = toDate(start);
  const endDate = toDate(end);
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
  const startLabel = formatter.format(startDate);
  const endLabel = formatter.format(endDate);
  const totalDays = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  return `${startLabel} - ${endLabel} · 共 ${totalDays} 天`;
}

function formatDayDate(date: string) {
  const target = toDate(date);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(target);
}

function formatTimeRange(start: string | null, end: string | null) {
  if (!start && !end) return "时间待定";
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const startLabel = start ? formatter.format(new Date(start)) : "未设定";
  const endLabel = end ? formatter.format(new Date(end)) : "未设定";
  return `${startLabel} - ${endLabel}`;
}

function toDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map((value) => Number.parseInt(value, 10));
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function formatDatetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const localTime = new Date(date.getTime() - offset * 60 * 1000);
  return localTime.toISOString().slice(0, 16);
}

function toIsoString(local: string) {
  try {
    const date = new Date(local);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

function normalizeBudgetBreakdown(value: Record<string, unknown> | null): BudgetSummary | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const total = toFiniteNumber(source.total);
  if (total === null) return null;
  const currency =
    typeof source.currency === "string" && source.currency.trim() ? source.currency.trim() : "CNY";

  const breakdownSource = Array.isArray(source.breakdown) ? source.breakdown : [];
  const breakdown = breakdownSource
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const category =
        typeof record.category === "string" && record.category.trim()
          ? record.category.trim()
          : null;
      const amount = toFiniteNumber(record.amount);
      if (!category || amount === null) return null;
      const description =
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : undefined;
      const percentageValue = toFiniteNumber(record.percentage);
      const percentage =
        percentageValue !== null ? percentageValue : total > 0 ? (amount / total) * 100 : 0;
      return {
        category,
        amount,
        description,
        percentage: Math.max(0, Math.min(100, percentage)),
      };
    })
    .filter(Boolean) as BudgetSummary["breakdown"];

  const tips = Array.isArray(source.tips)
    ? (source.tips as unknown[])
        .filter((tip): tip is string => typeof tip === "string" && tip.trim().length > 0)
        .map((tip) => tip.trim())
    : [];

  return {
    currency,
    total,
    breakdown,
    tips,
  };
}

function parseBudgetAmount(value: TripDetail["budget"] | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function extractCoordinatesFromDetails(details: Record<string, unknown> | null) {
  if (!details || typeof details !== "object") return null;
  const source = details as Record<string, unknown>;
  const lat = pickNumber(source, ["latitude", "lat", "latituide", "geoLat"]);
  const lng = pickNumber(source, ["longitude", "lng", "longtitude", "geoLng"]);
  if (typeof lat === "number" && typeof lng === "number") {
    return { lat, lng };
  }
  const coordinates = source.coordinates;
  if (Array.isArray(coordinates) && coordinates.length === 2) {
    const [lngValue, latValue] = coordinates;
    if (
      typeof latValue === "number" &&
      typeof lngValue === "number" &&
      Math.abs(latValue) <= 90 &&
      Math.abs(lngValue) <= 180
    ) {
      return { lat: latValue, lng: lngValue };
    }
  }
  return null;
}

function pickNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}
