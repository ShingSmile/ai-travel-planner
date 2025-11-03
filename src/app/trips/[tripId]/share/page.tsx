"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { getSupabaseClient } from "@/lib/supabase-client";

type ShareTrip = {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  days: Array<{
    id: string;
    date: string;
    summary: string | null;
    notes: string | null;
    activities: Array<{
      id: string;
      type: string | null;
      start_time: string | null;
      end_time: string | null;
      location: string | null;
      details: Record<string, unknown> | null;
    }>;
  }>;
};

function isShareTrip(value: unknown): value is ShareTrip {
  if (!value || typeof value !== "object") return false;
  const trip = value as Record<string, unknown>;
  if (
    typeof trip.id !== "string" ||
    typeof trip.title !== "string" ||
    typeof trip.destination !== "string" ||
    typeof trip.start_date !== "string" ||
    typeof trip.end_date !== "string" ||
    !Array.isArray(trip.days)
  ) {
    return false;
  }

  return (trip.days as unknown[]).every((day) => {
    if (!day || typeof day !== "object") return false;
    const dayRecord = day as Record<string, unknown>;
    if (
      typeof dayRecord.id !== "string" ||
      typeof dayRecord.date !== "string" ||
      !Array.isArray(dayRecord.activities)
    ) {
      return false;
    }

    return (dayRecord.activities as unknown[]).every((activity) => {
      if (!activity || typeof activity !== "object") return false;
      const activityRecord = activity as Record<string, unknown>;
      return typeof activityRecord.id === "string";
    });
  });
}

export default function TripSharePage({ params }: { params: { tripId: string } }) {
  const supabase = useMemo(() => {
    try {
      return getSupabaseClient();
    } catch (error) {
      console.error("[TripShare] failed to init supabase client:", error);
      return null;
    }
  }, []);
  const searchParams = useSearchParams();
  const [trip, setTrip] = useState<ShareTrip | null>(null);
  const [loading, setLoading] = useState<boolean>(() => supabase !== null);
  const [error, setError] = useState<string | null>(() =>
    supabase ? null : "系统暂未配置数据服务，无法加载行程。"
  );

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const loadTrip = async () => {
      setLoading(true);
      setError(null);
      const { data, error: queryError } = await supabase
        .from("trips")
        .select(
          "id, title, destination, start_date, end_date, summary, created_at, updated_at, days:trip_days(id, date, summary, notes, activities:activities(id, type, start_time, end_time, location, details)))"
        )
        .eq("id", params.tripId)
        .single();

      if (cancelled) return;

      if (queryError || !data) {
        setError("未找到行程，或该行程未开放分享。");
        setTrip(null);
        setLoading(false);
        return;
      }

      if (!isShareTrip(data)) {
        setError("行程数据格式不正确，无法分享。");
        setTrip(null);
        setLoading(false);
        return;
      }

      setTrip(data);
      setLoading(false);
    };

    void loadTrip();
    return () => {
      cancelled = true;
    };
  }, [params.tripId, supabase]);

  useEffect(() => {
    if (!trip) return;
    const shouldPrint = searchParams?.get("print") === "1";
    if (!shouldPrint) return;

    const timer = window.setTimeout(() => {
      window.print();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [trip, searchParams]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-muted">正在加载行程详情...</p>
      </div>
    );
  }

  if (!trip || error) {
    return (
      <div className="space-y-4 rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
        <h1 className="text-2xl font-semibold">无法访问行程</h1>
        <p className="text-sm text-muted">{error ?? "该行程暂不可分享，请联系创建者。"}</p>
        <Link href="/">
          <span className="text-sm text-primary">返回首页</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 rounded-3xl border border-border bg-surface p-6 shadow-card">
      <header className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted">行程分享</p>
          <h1 className="text-3xl font-semibold text-foreground">{trip.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
          <span>目的地：{trip.destination}</span>
          <span>{formatDateRange(trip.start_date, trip.end_date)}</span>
        </div>
      </header>

      <section className="space-y-6">
        {trip.days.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-background/60 p-6 text-sm text-muted">
            尚未生成每日安排。
          </p>
        ) : (
          trip.days.map((day, index) => (
            <article
              key={day.id}
              className="space-y-3 rounded-2xl border border-border bg-background/60 p-5"
            >
              <header className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted">
                  第 {index + 1} 天 · {formatDate(day.date)}
                </p>
                <h2 className="text-lg font-semibold text-foreground">
                  {day.summary ?? "待补充的行程概要"}
                </h2>
                {day.notes && <p className="text-sm text-muted">备注：{day.notes}</p>}
              </header>

              {day.activities.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-background/40 p-4 text-sm text-muted">
                  暂无活动安排。
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {day.activities.map((activity) => (
                    <li
                      key={activity.id}
                      className="rounded-xl border border-border bg-surface/80 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-medium text-foreground">
                          {getActivityLabel(activity.type)}
                        </span>
                        <span className="text-xs text-muted">{formatTimeRange(activity)}</span>
                      </div>
                      {activity.location && (
                        <p className="mt-2 text-xs text-muted">地点：{activity.location}</p>
                      )}
                      {activity.details && Object.keys(activity.details).length > 0 && (
                        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/20 p-3 text-xs text-muted">
                          {JSON.stringify(activity.details, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
      </section>

      <footer className="rounded-2xl border border-dashed border-border bg-background/50 p-4 text-xs text-muted">
        本行程由 AI 旅行规划师生成，仅供参考。请在出行前核实交通、开放时间及预订信息。
      </footer>
    </div>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTimeRange(activity: ShareTrip["days"][number]["activities"][number]) {
  if (!activity.start_time && !activity.end_time) {
    return "时间待定";
  }
  const formatTime = (value: string | null) => {
    if (!value) return null;
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    } catch {
      return value;
    }
  };
  const start = formatTime(activity.start_time);
  const end = formatTime(activity.end_time);
  if (start && end) {
    return `${start} - ${end}`;
  }
  return start ?? end ?? "时间待定";
}

function getActivityLabel(type: string | null) {
  if (!type) return "行程安排";
  const mapping: Record<string, string> = {
    transport: "交通安排",
    attraction: "景点/活动",
    dining: "餐饮",
    hotel: "住宿",
    shopping: "购物",
    accommodation: "住宿",
  };
  return mapping[type] ?? type;
}

function formatDateRange(start: string, end: string) {
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
    });
    return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
  } catch {
    return `${start} - ${end}`;
  }
}
