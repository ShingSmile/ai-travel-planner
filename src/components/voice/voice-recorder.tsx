"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { VoiceRecorderMeta, VoiceUploadResponse } from "@/types/voice";

type UploadState = "idle" | "uploading" | "success" | "error";

export interface VoiceRecorderProps {
  sessionToken: string | null;
  meta: VoiceRecorderMeta;
  className?: string;
  /**
   * 在语音识别成功后回调，通常用于更新表单字段。
   */
  onRecognized?: (payload: VoiceUploadResponse) => void;
}

const supportedMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
];

export function VoiceRecorder({ sessionToken, meta, className, onRecognized }: VoiceRecorderProps) {
  const { toast } = useToast();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const isUnmountedRef = useRef(false);
  const audioUrlRef = useRef<string | null>(null);
  const recordStartRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "preparing" | "recording" | "recorded">("idle");
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [supported, setSupported] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasSupport = !!navigator.mediaDevices && typeof window.MediaRecorder !== "undefined";
    setSupported(hasSupport);
  }, [cleanupMedia]);

  useEffect(() => {
    if (phase !== "recording" || recordStartRef.current === null) {
      if (phase === "recorded") {
        setElapsedMs(recordedDuration);
      } else if (phase !== "preparing") {
        setElapsedMs(0);
      }
      return;
    }
    const updateElapsed = () => {
      if (recordStartRef.current !== null) {
        setElapsedMs(Date.now() - recordStartRef.current);
      }
    };
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 200);
    return () => window.clearInterval(interval);
  }, [phase, recordedDuration]);

  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      cleanupMedia();
    };
  }, [cleanupMedia]);

  const statusText = useMemo(() => {
    if (phase === "preparing") {
      return "正在请求麦克风权限...";
    }
    if (phase === "recording") {
      return `录制中 · ${formatDuration(elapsedMs)}`;
    }
    if (phase === "recorded") {
      return `录制完成 · ${formatDuration(recordedDuration)}`;
    }
    if (uploadState === "uploading") {
      return "正在上传并识别...";
    }
    if (uploadState === "success") {
      return "识别完成";
    }
    if (uploadState === "error") {
      return "识别失败，请重试";
    }
    return "准备就绪";
  }, [phase, elapsedMs, uploadState, recordedDuration]);

  const startRecording = async () => {
    if (!supported) {
      toast({
        title: "浏览器不支持语音录制",
        description: "建议使用最新版 Chrome 或 Edge。",
        variant: "warning",
      });
      return;
    }

    try {
      setPhase("preparing");
      setErrorMessage(null);
      setTranscript(null);
      setUploadState("idle");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const chosenMime =
        supportedMimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";

      const recorder = new MediaRecorder(stream, chosenMime ? { mimeType: chosenMime } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        if (isUnmountedRef.current) {
          stopStreamTracks();
          return;
        }
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || chosenMime || "audio/webm",
        });
        setAudioBlob(blob);
        setMimeType(recorder.mimeType || chosenMime || "audio/webm");
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        const newUrl = URL.createObjectURL(blob);
        audioUrlRef.current = newUrl;
        setAudioUrl(newUrl);
        const startedAt = recordStartRef.current;
        const durationMs =
          typeof startedAt === "number" ? Date.now() - startedAt : elapsedMs || recordedDuration;
        setRecordedDuration(durationMs);
        setElapsedMs(durationMs);
        setPhase("recorded");
        recordStartRef.current = null;
        stopStreamTracks();
      });

      recorder.start();
      recordStartRef.current = Date.now();
      setElapsedMs(0);
      setRecordedDuration(0);
      setPhase("recording");
    } catch (error) {
      console.error("[VoiceRecorder] startRecording error:", error);
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "未授权麦克风权限，请在浏览器设置中允许访问。"
          : "无法访问麦克风，请确认设备状态后重试。";
      setErrorMessage(message);
      setPhase("idle");
      toast({
        title: "录音启动失败",
        description: message,
        variant: "error",
      });
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const resetRecording = () => {
    stopRecording();
    cleanupMedia();
    setPhase("idle");
    setAudioBlob(null);
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    setMimeType(null);
    setElapsedMs(0);
    setRecordedDuration(0);
    recordStartRef.current = null;
    setUploadState("idle");
    setTranscript(null);
    setErrorMessage(null);
  };

  const uploadRecording = async () => {
    if (!audioBlob) {
      toast({
        title: "尚无录音",
        description: "请先完成录音，再尝试上传。",
        variant: "warning",
      });
      return;
    }
    if (!sessionToken) {
      toast({
        title: "尚未登录",
        description: "请登录后再上传语音内容。",
        variant: "warning",
      });
      return;
    }

    setUploadState("uploading");
    setErrorMessage(null);
    try {
      const formData = new FormData();
      const extension = mimeType?.includes("mp4") ? "m4a" : "webm";
      formData.append("audio", audioBlob, `voice-${Date.now()}.${extension}`);
      formData.append("purpose", meta.purpose);
      if (meta.tripId) {
        formData.append("tripId", meta.tripId);
      }

      const response = await fetch("/api/voice-inputs", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message ?? "语音识别失败，请稍后重试。");
      }

      setUploadState("success");
      setTranscript(payload.data.transcript as string);
      toast({
        title: "语音识别成功",
        description: "已返回识别结果，可继续完善表单。",
        variant: "success",
      });
      onRecognized?.(payload.data as VoiceUploadResponse);
    } catch (error) {
      console.error("[VoiceRecorder] upload error:", error);
      const message = error instanceof Error ? error.message : "语音识别失败，请稍后重试。";
      setUploadState("error");
      setErrorMessage(message);
      toast({
        title: "上传失败",
        description: message,
        variant: "error",
      });
    }
  };

  const stopStreamTracks = useCallback(() => {
    if (!mediaStreamRef.current) return;
    mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const cleanupMedia = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    stopStreamTracks();
  }, [stopStreamTracks]);

  return (
    <section
      className={cn(
        "space-y-4 rounded-3xl border border-dashed border-border/70 bg-surface/80 p-6 shadow-card",
        className
      )}
    >
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">语音速记</h2>
          <p className="text-xs text-muted">直接描述旅行需求或费用明细，系统会自动识别文本。</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant={phase === "recording" ? "destructive" : "primary"}
            onClick={phase === "recording" ? stopRecording : startRecording}
          >
            {phase === "recording" ? "停止录制" : "开始录音"}
          </Button>
          {phase === "recording" ? (
            <div className="flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-xs text-destructive">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-destructive" />
              正在录制
            </div>
          ) : null}
        </div>
      </header>

      <div className="rounded-2xl border border-border/70 bg-background/50 p-4 text-sm text-muted">
        {statusText}
        {errorMessage && <p className="mt-2 text-destructive">{errorMessage}</p>}
      </div>

      {audioUrl ? (
        <div className="space-y-3">
          <audio src={audioUrl} controls className="w-full rounded-2xl" />
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={resetRecording}>
              重新录制
            </Button>
            <Button type="button" disabled={uploadState === "uploading"} onClick={uploadRecording}>
              {uploadState === "uploading" ? (
                <>
                  <Spinner size="sm" />
                  上传中...
                </>
              ) : (
                "上传并识别"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">
          请点击“开始录音”描述关键需求，录制完成后可以回放确认并上传识别。
        </p>
      )}

      {transcript ? (
        <div className="space-y-2 rounded-2xl border border-border/70 bg-background/60 p-4 text-sm text-foreground">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">识别结果</p>
          <p className="leading-relaxed">{transcript}</p>
        </div>
      ) : null}
    </section>
  );
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}
