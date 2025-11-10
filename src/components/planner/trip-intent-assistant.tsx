"use client";

import { useState } from "react";
import { TextArea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { useToast } from "@/components/ui/toast";
import type { TripIntentDraft, TripIntentSource } from "@/types/trip-intent";
import { cn } from "@/lib/utils";
import { collectMissingFields, trackTripIntentEvent } from "@/lib/analytics";

interface TripIntentAssistantProps {
  sessionToken: string | null;
  onApply: (draft: TripIntentDraft) => void;
}

export function TripIntentAssistant({ sessionToken, onApply }: TripIntentAssistantProps) {
  const [rawInput, setRawInput] = useState("");
  const [draft, setDraft] = useState<TripIntentDraft | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentFailures, setRecentFailures] = useState(0);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const { toast } = useToast();

  const recordSuccess = (
    intent: TripIntentDraft,
    meta: { source: TripIntentSource; durationMs?: number; silent?: boolean }
  ) => {
    setDraft(intent);
    setRawInput(intent.rawInput);
    setRecentFailures(0);
    setLastDurationMs(meta.durationMs ?? 0);
    trackTripIntentEvent({
      source: meta.source,
      success: true,
      durationMs: meta.durationMs ?? 0,
      missingFields: collectMissingFields(intent),
      confidence: intent.confidence,
    });
    if (!meta.silent) {
      toast({
        title: "解析完成",
        description: "可在下方查看拆解结果并选择应用到表单。",
        variant: "success",
      });
    }
  };

  const recordFailure = (source: TripIntentSource, durationMs: number, message: string) => {
    setRecentFailures((prev) => prev + 1);
    trackTripIntentEvent({
      source,
      success: false,
      durationMs,
      missingFields: [],
      errorMessage: message,
    });
  };

  const runParser = async (params: {
    source: TripIntentSource;
    text?: string;
    voiceInputId?: string | null;
    silentSuccess?: boolean;
  }) => {
    const target = (params.text ?? rawInput).trim();
    if (!target) {
      setError("请先输入一段描述或通过语音录制。");
      return;
    }

    if (!sessionToken) {
      setError("请先登录再使用解析功能。");
      toast({
        title: "需要登录",
        description: "请登录后再尝试自动解析行程需求。",
        variant: "warning",
      });
      return;
    }

    const startedAt = performance.now();
    try {
      setProcessing(true);
      setError(null);
      const response = await fetch("/api/trip-intents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          rawInput: target,
          source: params.source,
          voiceInputId: params.voiceInputId ?? undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message ?? "解析失败，请稍后再试。");
      }

      const intent = payload.data.intent as TripIntentDraft;
      const durationMs = Math.round(performance.now() - startedAt);
      recordSuccess(intent, {
        source: params.source,
        durationMs,
        silent: params.silentSuccess,
      });
    } catch (parserError) {
      console.error("[TripIntentAssistant] parse error:", parserError);
      setDraft(null);
      setError(parserError instanceof Error ? parserError.message : "解析失败，请修改描述后重试。");
      const durationMs = Math.round(performance.now() - startedAt);
      recordFailure(
        params.source,
        durationMs,
        parserError instanceof Error ? parserError.message : "parse_error"
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface/90 p-6 shadow-card">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
          语音 / 文本助手
        </p>
        <h2 className="text-xl font-semibold text-foreground">一句话描述行程，自动填表</h2>
        <p className="text-sm text-muted">
          试着说：「我想去江苏苏州，3 天，预算 2000元，喜欢美食和动漫，带孩子」。
        </p>
      </header>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground/90">文本描述</label>
        <TextArea
          placeholder="输入或粘贴一段旅行意图，点击解析即可自动拆解字段"
          rows={4}
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={() => runParser({ source: "text" })}
            disabled={processing}
          >
            {processing ? (
              <>
                <Spinner size="sm" />
                解析中...
              </>
            ) : (
              "解析文本"
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setRawInput("");
              setDraft(null);
              setError(null);
            }}
          >
            清空
          </Button>
        </div>
        {lastDurationMs !== null && draft && (
          <p className="text-xs text-muted">
            最近一次解析耗时 {lastDurationMs} ms，置信度 {Math.round(draft.confidence * 100)}%
          </p>
        )}
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground/90">语音快捷描述</label>
        <VoiceRecorder
          sessionToken={sessionToken}
          meta={{ purpose: "trip_notes" }}
          onRecognized={(payload) => {
            if (!payload?.transcript) return;
            if (payload.tripIntent) {
              recordSuccess(payload.tripIntent, { source: "voice", durationMs: 0, silent: false });
              return;
            }
            runParser({
              source: "voice",
              text: payload.transcript,
              voiceInputId: payload.voiceInputId,
              silentSuccess: true,
            });
          }}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {recentFailures >= 2 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          解析多次失败，可先手动填写表单字段，或稍后在网络更佳时重试。
        </div>
      )}

      {draft && (
        <div className="space-y-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-primary">解析结果</span>
              <span className="text-muted">
                置信度：{formatConfidenceLabel(draft.confidence)}（
                {Math.round(draft.confidence * 100)}%）
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
              <div
                className={cn("h-full rounded-full bg-primary transition-all")}
                style={{ width: `${Math.round(draft.confidence * 100)}%` }}
              />
            </div>
          </div>

          <ul className="space-y-3 text-sm text-foreground/90">
            {renderField(
              "目的地",
              draft.destinations.length > 0 ? draft.destinations.join(" / ") : "待补充",
              draft.fieldConfidences.destination
            )}
            {renderField("日期 / 天数", formatDateRange(draft), draft.fieldConfidences.date)}
            {renderField(
              "预算",
              draft.budget ? `${draft.budget.amount} ${draft.budget.currency}` : "待补充",
              draft.fieldConfidences.budget
            )}
            {renderField(
              "同行人数",
              draft.travelParty?.description ?? "待补充",
              draft.fieldConfidences.travelers
            )}
            {renderField(
              "旅行偏好",
              draft.preferences.length > 0 ? draft.preferences.join(" / ") : "待补充",
              draft.fieldConfidences.preferences
            )}
          </ul>

          <Button type="button" className="w-full" onClick={() => onApply(draft)}>
            应用到表单
          </Button>
          <p className="text-xs text-muted">
            应用后仍可继续编辑表单，解析原文会保留在本面板，方便随时重新调整。
          </p>
        </div>
      )}
    </section>
  );
}

function formatConfidenceLabel(value: number) {
  if (value >= 0.8) return "高";
  if (value >= 0.55) return "中";
  if (value > 0) return "低";
  return "无";
}

function renderField(label: string, value: string, confidence = 0) {
  return (
    <li className="flex items-start justify-between gap-2">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">{label}</p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
      <span
        className={cn(
          "mt-1 rounded-full px-2 py-0.5 text-xs",
          confidence >= 0.75
            ? "bg-emerald-100 text-emerald-600"
            : confidence >= 0.4
              ? "bg-amber-100 text-amber-600"
              : "bg-gray-100 text-gray-500"
        )}
      >
        {(confidence * 100).toFixed(0)}%
      </span>
    </li>
  );
}

function formatDateRange(draft: TripIntentDraft) {
  const { dateRange } = draft;
  if (!dateRange) {
    return "待补充";
  }
  if (dateRange.startDate && dateRange.endDate) {
    return `${dateRange.startDate} → ${dateRange.endDate}`;
  }
  if (dateRange.startDate && dateRange.durationDays) {
    return `${dateRange.startDate} 起 · ${dateRange.durationDays} 天`;
  }
  if (dateRange.durationDays) {
    return `${dateRange.durationDays} 天`;
  }
  return dateRange.startDate ?? "待补充";
}
