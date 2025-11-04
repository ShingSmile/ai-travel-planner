import type { Buffer } from "node:buffer";
import { ApiErrorResponse } from "@/lib/api-response";
import type { VoiceIntent } from "@/types/voice";

type VoicePurpose = "trip_notes" | "expense";

export interface RecognizeRequest {
  audio: Buffer;
  mimeType?: string;
  purpose: VoicePurpose;
  transcriptHint?: string | null;
}

export interface RecognizeResult {
  transcript: string;
  intent: VoiceIntent;
  expenseDraft?: {
    category?: string;
    amount?: number;
    currency?: string;
    memo?: string;
    source?: string;
  };
}

const expenseKeywords: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /(餐|吃|午饭|晚饭|早餐|午餐|晚餐|美食|餐厅)/i, category: "餐饮" },
  { pattern: /(酒|酒店|住宿|民宿|旅馆|房)/i, category: "住宿" },
  { pattern: /(交通|打车|的士|出租车|地铁|公交|动车|高铁|机票|航班|车票|船票)/i, category: "交通" },
  { pattern: /(门票|景点|游玩|娱乐|体验|票)/i, category: "门票" },
  { pattern: /(购物|买|纪念品|特产|礼物)/i, category: "购物" },
];

const currencyMap: Record<string, string> = {
  元: "CNY",
  块: "CNY",
  人民币: "CNY",
  rmb: "CNY",
  cny: "CNY",
  美元: "USD",
  usd: "USD",
  日元: "JPY",
  jpy: "JPY",
  欧元: "EUR",
  eur: "EUR",
  港币: "HKD",
  hkd: "HKD",
};

export async function recognizeVoice({
  audio,
  mimeType,
  purpose,
  transcriptHint,
}: RecognizeRequest): Promise<RecognizeResult> {
  if (!audio || audio.length === 0) {
    throw new ApiErrorResponse("音频内容为空，无法识别。", 400, "empty_audio");
  }

  const normalizedMime = normalizeMimeType(mimeType);
  if (mimeType && !mimeType.startsWith("audio/")) {
    console.warn(`[voice] 收到非音频 MIME 类型：${mimeType}`);
  }

  const provider =
    process.env.VOICE_RECOGNIZER_PROVIDER?.toLowerCase()?.trim() ??
    process.env.VOICE_RECOGNIZER_MODE?.toLowerCase()?.trim() ??
    "mock";

  let transcript: string;
  if (provider === "mock") {
    transcript =
      (transcriptHint && transcriptHint.trim()) ||
      process.env.VOICE_RECOGNIZER_MOCK_TRANSCRIPT?.trim() ||
      "（示例）请接入真实语音识别服务以获得准确文本。";
  } else if (provider === "openai" || provider === "openai_whisper" || provider === "whisper") {
    transcript = await recognizeWithOpenAi({
      audio,
      mimeType: normalizedMime,
      hint: transcriptHint ?? undefined,
    });
  } else {
    throw new ApiErrorResponse(
      `暂不支持的语音识别提供方：${provider}，请设置 VOICE_RECOGNIZER_PROVIDER=mock 或 openai。`,
      500,
      "voice_provider_unsupported"
    );
  }

  const normalizedTranscript = transcript.trim();
  if (!normalizedTranscript) {
    throw new ApiErrorResponse(
      "语音识别服务未返回文本，请稍后重试。",
      502,
      "voice_empty_transcript"
    );
  }

  const intent = inferIntent(purpose, normalizedTranscript);
  const expenseDraft = intent === "expense" ? inferExpenseDraft(normalizedTranscript) : undefined;

  return {
    transcript: normalizedTranscript,
    intent,
    expenseDraft,
  };
}

async function recognizeWithOpenAi({
  audio,
  mimeType,
  hint,
}: {
  audio: Buffer;
  mimeType: string;
  hint?: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiErrorResponse(
      "未配置 OpenAI 语音识别密钥，请设置 OPENAI_API_KEY。",
      500,
      "voice_provider_not_configured"
    );
  }

  const baseUrl =
    process.env.OPENAI_API_BASE_URL?.replace(/\/+$/, "") ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_VOICE_MODEL?.trim() || "gpt-4o-mini-transcribe";
  const timeoutMs = resolveTimeout(Number(process.env.VOICE_RECOGNIZER_TIMEOUT_MS), 45000);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const formData = new FormData();
    const extension = guessExtensionByMime(mimeType);
    formData.append("model", model);
    formData.append(
      "file",
      new Blob([audio], { type: mimeType }),
      `voice-${Date.now()}.${extension}`
    );
    formData.append("temperature", "0");
    formData.append("language", "zh");
    if (hint && hint.trim().length > 0) {
      formData.append("prompt", hint.trim());
    }
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    if (!response.ok) {
      const errorBody = isJson ? await response.json().catch(() => null) : await response.text();
      throw new ApiErrorResponse(
        "语音识别服务调用失败，请稍后重试。",
        response.status || 502,
        "voice_provider_http_error",
        {
          body: errorBody,
        }
      );
    }

    const payload = isJson ? await response.json() : {};
    const transcript =
      typeof payload?.text === "string"
        ? payload.text
        : Array.isArray(payload?.segments) && payload.segments.length > 0
          ? payload.segments.map((segment: { text?: string }) => segment.text ?? "").join("")
          : null;

    if (!transcript || !transcript.trim()) {
      throw new ApiErrorResponse("语音识别服务未返回有效文本。", 502, "voice_provider_empty");
    }

    return transcript;
  } catch (error) {
    if (error instanceof ApiErrorResponse) {
      throw error;
    }
    if ((error as Error)?.name === "AbortError") {
      throw new ApiErrorResponse("语音识别超时，请稍后重试。", 504, "voice_provider_timeout");
    }
    console.error("[voice] OpenAI 语音识别调用异常：", error);
    throw new ApiErrorResponse("语音识别过程中出现异常，请稍后再试。", 502, "voice_provider_error");
  } finally {
    clearTimeout(timeout);
  }
}

function inferIntent(purpose: VoicePurpose, transcript: string): VoiceIntent {
  if (purpose === "expense") {
    return "expense";
  }
  const expenseSignals = /(花了|花费|支出|消费|金额|报销|预算|买了|花掉)/i;
  if (expenseSignals.test(transcript)) {
    return "expense";
  }
  return "trip_notes";
}

function inferExpenseDraft(transcript: string) {
  const amountMatch = transcript.match(
    /(-?\d+(?:[.,]\d+)?)(?:\s*)(元|块|人民币|RMB|CNY|美元|USD|美金|日元|JPY|欧元|EUR|港币|HKD)?/i
  );
  if (!amountMatch) {
    return undefined;
  }

  const amount = Number.parseFloat(amountMatch[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  const currencyKey = amountMatch[2]?.toLowerCase();
  const currency = (currencyKey && currencyMap[currencyKey]) || "CNY";

  const category = expenseKeywords.find(({ pattern }) => pattern.test(transcript))?.category;

  const memoKeywords = /(备注|说明|记录|memo)/i.test(transcript) ? transcript : undefined;

  return {
    category,
    amount,
    currency,
    memo: memoKeywords,
  };
}

function normalizeMimeType(mimeType?: string) {
  if (!mimeType) return "audio/webm";
  if (mimeType.startsWith("audio/")) return mimeType;
  return `audio/${mimeType.split("/")[1] ?? "webm"}`;
}

function guessExtensionByMime(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  return "dat";
}

function resolveTimeout(candidate: number, fallback: number) {
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return fallback;
  }
  return Math.max(5000, Math.min(candidate, 120000));
}
