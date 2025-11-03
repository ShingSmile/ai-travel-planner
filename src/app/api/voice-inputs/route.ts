import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { ok, handleApiError, ApiErrorResponse } from "@/lib/api-response";
import { requireAuthContext } from "@/lib/auth-helpers";
import { recognizeVoice } from "@/lib/voice/recognizer";
import { consumeRateLimit, resolveRateLimitNumber } from "@/lib/rate-limit";

const MAX_FILE_SIZE = Number(process.env.VOICE_MAX_FILE_SIZE ?? 5 * 1024 * 1024); // 5MB 默认限制
type VoicePurpose = "trip_notes" | "expense";
const ALLOWED_PURPOSES = new Set<VoicePurpose>(["trip_notes", "expense"]);
const DEFAULT_BUCKET = process.env.SUPABASE_VOICE_BUCKET ?? "voice-inputs";
const VOICE_RATE_LIMIT_WINDOW_MS = resolveRateLimitNumber(
  process.env.VOICE_RATE_LIMIT_WINDOW_MS,
  60_000
);
const VOICE_RATE_LIMIT_MAX = resolveRateLimitNumber(process.env.VOICE_RATE_LIMIT_MAX, 10);

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireAuthContext();
    const formData = await request.formData();

    const audioBlob = formData.get("audio");
    if (!audioBlob || !(audioBlob instanceof Blob)) {
      throw new ApiErrorResponse("缺少音频文件。", 400, "missing_audio");
    }

    if (audioBlob.size === 0) {
      throw new ApiErrorResponse("音频文件为空。", 400, "empty_audio");
    }

    if (audioBlob.size > MAX_FILE_SIZE) {
      const sizeMb = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(1);
      throw new ApiErrorResponse(
        `音频文件过大，请控制在 ${sizeMb} MB 以内。`,
        413,
        "file_too_large"
      );
    }

    const rateLimitResult = consumeRateLimit({
      bucket: "voice_upload",
      identifier: user.id,
      windowMs: VOICE_RATE_LIMIT_WINDOW_MS,
      limit: VOICE_RATE_LIMIT_MAX,
    });

    if (!rateLimitResult.allowed) {
      throw new ApiErrorResponse(
        "上传过于频繁，请稍后再试。",
        429,
        "voice_rate_limited",
        {
          retryAfter: rateLimitResult.retryAfter,
        },
        { headers: rateLimitResult.headers }
      );
    }

    const purposeRaw = formData.get("purpose");
    const purpose =
      typeof purposeRaw === "string" && ALLOWED_PURPOSES.has(purposeRaw as VoicePurpose)
        ? (purposeRaw as VoicePurpose)
        : "trip_notes";

    const tripIdRaw = formData.get("tripId");
    const tripId =
      typeof tripIdRaw === "string" && tripIdRaw.trim().length > 0 ? tripIdRaw.trim() : null;

    if (tripId) {
      const { data: tripData, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("id", tripId)
        .single();

      if (tripError || !tripData) {
        throw new ApiErrorResponse(
          "未找到对应的行程，无法绑定语音记录。",
          404,
          "trip_not_found",
          tripError
        );
      }
    }

    const transcriptHint = formData.get("transcriptHint");
    const fileName = getFileName(audioBlob);
    const mimeType = audioBlob.type || "application/octet-stream";
    const extension = getFileExtension(fileName, mimeType);
    const objectPath = `${user.id}/${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await audioBlob.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(DEFAULT_BUCKET)
      .upload(objectPath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new ApiErrorResponse(
        "音频上传失败，请稍后重试。",
        500,
        "storage_upload_failed",
        uploadError
      );
    }

    const { data: publicUrlData } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(objectPath);
    const audioUrl = publicUrlData?.publicUrl ?? null;

    const insertPayload = {
      user_id: user.id,
      trip_id: tripId,
      audio_url: audioUrl ?? objectPath,
      transcript: null,
      status: "processing",
    };

    const { data: voiceInput, error: insertError } = await supabase
      .from("voice_inputs")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError || !voiceInput) {
      throw new ApiErrorResponse("保存语音记录失败。", 500, "db_insert_error", insertError);
    }

    let recognitionResult: Awaited<ReturnType<typeof recognizeVoice>>;
    try {
      recognitionResult = await recognizeVoice({
        audio: buffer,
        mimeType,
        purpose,
        transcriptHint: typeof transcriptHint === "string" ? transcriptHint : null,
      });
    } catch (error) {
      await supabase.from("voice_inputs").update({ status: "failed" }).eq("id", voiceInput.id);
      throw error;
    }

    await supabase
      .from("voice_inputs")
      .update({
        transcript: recognitionResult.transcript,
        status: "completed",
      })
      .eq("id", voiceInput.id);

    return ok(
      {
        voiceInputId: voiceInput.id,
        transcript: recognitionResult.transcript,
        intent: recognitionResult.intent,
        expenseDraft: recognitionResult.expenseDraft,
      },
      { headers: rateLimitResult.headers }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

function getFileName(file: Blob) {
  if ("name" in file && typeof (file as File).name === "string") {
    return (file as File).name;
  }
  return `voice-${Date.now()}`;
}

function getFileExtension(fileName: string, mimeType: string) {
  const fallback = mimeType.split("/")[1] || "webm";
  const nameParts = fileName.toLowerCase().split(".");
  if (nameParts.length > 1) {
    return nameParts.pop() ?? fallback;
  }

  if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
    return "m4a";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  if (mimeType.includes("wav")) {
    return "wav";
  }
  if (mimeType.includes("mp3")) {
    return "mp3";
  }
  return fallback;
}
