"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { TextArea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { getSupabaseClient } from "@/lib/supabase-client";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { getPlaywrightBypassToken } from "@/lib/test-flags";

type TravelerDraft = {
  name: string;
  role?: string;
};

const travelStyles = ["慢节奏探索", "亲子友好", "城市漫游", "户外探险", "美食优先", "文化体验"];

export default function PlannerNewPage() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const bypassToken = useMemo(() => getPlaywrightBypassToken(), []);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("");
  const [travelers, setTravelers] = useState<TravelerDraft[]>([{ name: "", role: "" }]);
  const [travelStyle, setTravelStyle] = useState(travelStyles[0]);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [currentTagInput, setCurrentTagInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (bypassToken) {
      setSessionToken(bypassToken);
      setLoadingSession(false);
      return;
    }
    if (!supabase) {
      setLoadingSession(false);
      setSessionToken(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSessionToken(data.session?.access_token ?? null);
      setLoadingSession(false);
    });
  }, [supabase, bypassToken]);

  const handleAddTraveler = () => {
    setTravelers((prev) => [...prev, { name: "", role: "" }]);
  };

  const handleTravelerChange = (index: number, field: keyof TravelerDraft, value: string) => {
    setTravelers((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: value,
      };
      return next;
    });
  };

  const handleTagAdd = () => {
    if (!currentTagInput.trim()) return;
    const nextTag = currentTagInput.trim();
    if (tags.includes(nextTag)) {
      toast({
        title: "标签已存在",
        description: "相同标签无需重复添加。",
        variant: "warning",
      });
      return;
    }
    setTags((prev) => [...prev, nextTag]);
    setCurrentTagInput("");
  };

  const handleRemoveTag = (target: string) => {
    setTags((prev) => prev.filter((tag) => tag !== target));
  };

  const resetForm = () => {
    setTitle("");
    setDestination("");
    setStartDate("");
    setEndDate("");
    setBudget("");
    setTravelers([{ name: "", role: "" }]);
    setTravelStyle(travelStyles[0]);
    setNotes("");
    setTags([]);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loadingSession) return;

    const effectiveSessionToken = sessionToken ?? bypassToken;
    if (!effectiveSessionToken) {
      toast({
        title: "尚未登录",
        description: "请先登录以保存行程规划。",
        variant: "warning",
      });
      return;
    }

    if (!title.trim() || !destination.trim()) {
      setFormError("请填写行程标题与目的地。");
      return;
    }

    if (!startDate || !endDate) {
      setFormError("请选择行程日期。");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setFormError("开始日期不能晚于结束日期。");
      return;
    }

    setFormError(null);
    setSubmitting(true);

    try {
      const payload = {
        title: title.trim(),
        destination: destination.trim(),
        startDate,
        endDate,
        budget: budget ? Number(budget) : undefined,
        travelers: travelers
          .filter((item) => item.name.trim())
          .map((item) => ({
            name: item.name.trim(),
            role: item.role?.trim() || undefined,
          })),
        tags: tags.length > 0 ? tags : undefined,
        llmRequest: {
          travelStyle,
          notes,
        },
      };

      const response = await fetch("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${effectiveSessionToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error?.message ?? "创建行程失败");
      }

      toast({
        title: "行程创建成功",
        description: "已为你保存草稿，稍后可继续完善详情。",
        variant: "success",
      });
      resetForm();
      router.push(`/trips/${result.data.trip.id}/generate`);
    } catch (error) {
      console.error("[planner/new] create trip error:", error);
      toast({
        title: "创建失败",
        description: error instanceof Error ? error.message : "未知错误，请稍后重试。",
        variant: "error",
      });
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr,0.8fr]">
      <section className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold">新建旅行计划</h1>
          <p className="text-sm text-muted">
            填写核心信息后即可生成行程草稿，稍后可接入 LLM 自动补全每日安排。
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-border bg-surface p-6 shadow-card"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="行程标题"
              placeholder="如：东京亲子游 / 成都美食周末"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              label="目的地"
              placeholder="城市或区域"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
            <Input
              label="开始日期"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
            <Input
              label="结束日期"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
            <Input
              label="预算（元）"
              type="number"
              min="0"
              placeholder="可选"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground/90">偏好旅行方式</span>
              <select
                className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={travelStyle}
                onChange={(event) => setTravelStyle(event.target.value)}
              >
                {travelStyles.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground/90">同行人信息</h2>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddTraveler}>
                添加同行人
              </Button>
            </div>
            <div className="space-y-3">
              {travelers.map((traveler, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-2xl border border-dashed border-border/70 p-3 sm:grid-cols-2"
                >
                  <Input
                    label="姓名"
                    placeholder="如：张三 / Lily"
                    value={traveler.name}
                    onChange={(event) => handleTravelerChange(index, "name", event.target.value)}
                  />
                  <Input
                    label="角色"
                    placeholder="如：朋友 / 孩子 / 父母"
                    value={traveler.role ?? ""}
                    onChange={(event) => handleTravelerChange(index, "role", event.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground/90">标签</label>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-border px-3 py-2">
                <input
                  className="flex-1 bg-transparent text-sm text-foreground outline-none"
                  placeholder="输入标签后回车添加，例如：亲子 / 美食"
                  value={currentTagInput}
                  onChange={(event) => setCurrentTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleTagAdd();
                    }
                  }}
                />
                <Button type="button" size="sm" variant="ghost" onClick={handleTagAdd}>
                  添加
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary"
                  >
                    {tag}
                    <button
                      type="button"
                      className="text-primary hover:text-primary/70"
                      onClick={() => handleRemoveTag(tag)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <VoiceRecorder
            sessionToken={sessionToken}
            meta={{ purpose: "trip_notes" }}
            onRecognized={(payload) => {
              if (!payload?.transcript) return;
              setNotes((previous) => {
                if (!previous?.trim()) {
                  return payload.transcript;
                }
                return `${previous.trim()}\n${payload.transcript}`;
              });
            }}
          />

          <TextArea
            label="补充说明"
            placeholder="可填写偏好景点、必须安排的活动、饮食禁忌等信息"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <Button type="submit" className="w-full" loading={submitting}>
            {submitting ? (
              <>
                <Spinner size="sm" />
                提交中...
              </>
            ) : (
              "保存并生成草稿"
            )}
          </Button>
        </form>
      </section>

      <aside className="space-y-4 rounded-3xl border border-dashed border-border/70 bg-surface/80 p-6 shadow-card">
        <h2 className="text-lg font-semibold">表单小贴士</h2>
        <ul className="space-y-3 text-sm text-muted">
          <li>· 行程标题和目的地将作为行程卡片的主要信息，请准确填写。</li>
          <li>· 预算字段支持留空，系统将基于 LLM 输出估算各类别支出。</li>
          <li>· 标签可用于仪表盘筛选，例如“亲子”“城市漫游”。</li>
          <li>· 提交后会返回草稿状态，可在详情页继续完善行程与预算。</li>
        </ul>
        <div className="rounded-2xl bg-primary/10 p-4 text-sm text-primary">
          Tips：后续迭代将支持语音输入、日历导入等快捷方式，欢迎持续关注。
        </div>
      </aside>
    </div>
  );
}
