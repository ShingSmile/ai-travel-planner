import { Buffer } from "node:buffer";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { ApiErrorResponse } from "@/lib/api-response";
import type { VoiceIntent } from "@/types/voice";
import ffmpegBinary from "ffmpeg-static";

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
  } else if (provider === "iflytek" || provider === "xfyun") {
    transcript = await recognizeWithIflytek({
      audio,
    });
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
    const underlyingBuffer = audio.buffer as ArrayBuffer;
    const audioArrayBuffer =
      audio.byteOffset === 0 && audio.byteLength === underlyingBuffer.byteLength
        ? underlyingBuffer
        : underlyingBuffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
    const extension = guessExtensionByMime(mimeType);
    formData.append("model", model);
    formData.append(
      "file",
      new Blob([audioArrayBuffer], { type: mimeType }),
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

async function recognizeWithIflytek({ audio }: { audio: Buffer }) {
  const appId = process.env.IFLYTEK_APP_ID?.trim();
  const apiKey = process.env.IFLYTEK_API_KEY?.trim();
  const apiSecret = process.env.IFLYTEK_API_SECRET?.trim();

  if (!appId || !apiKey || !apiSecret) {
    throw new ApiErrorResponse(
      "未配置讯飞语音识别密钥，请设置 IFLYTEK_APP_ID、IFLYTEK_API_KEY、IFLYTEK_API_SECRET。",
      500,
      "voice_provider_not_configured"
    );
  }

  const pcmBuffer = await convertAudioToPcm16(audio);
  const timeoutMs = resolveTimeout(Number(process.env.VOICE_RECOGNIZER_TIMEOUT_MS), 45000);
  const baseUrlRaw = process.env.IFLYTEK_API_BASE_URL?.trim() ?? "wss://iat-api.xfyun.cn/v2/iat";
  const wsUrl = buildIflytekWsUrl(baseUrlRaw, apiKey, apiSecret);

  const dwa = process.env.IFLYTEK_DWA?.trim();
  const domain =
    process.env.IFLYTEK_DOMAIN?.trim() ?? process.env.IFLYTEK_ENGINE_TYPE?.trim() ?? "iat";
  const businessPayload: Record<string, unknown> = {
    language: process.env.IFLYTEK_LANGUAGE?.trim() || "zh_cn",
    accent: process.env.IFLYTEK_ACCENT?.trim() || "mandarin",
    domain,
    vad_eos: Number.isFinite(Number(process.env.IFLYTEK_VAD_EOS))
      ? Number(process.env.IFLYTEK_VAD_EOS)
      : 3000,
  };

  if (dwa && dwa !== "none") {
    businessPayload.dwa = dwa;
  }

  return streamIflytekRecognition({
    url: wsUrl,
    appId,
    business: businessPayload,
    audio: pcmBuffer,
    timeoutMs,
  });
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

async function convertAudioToPcm16(audio: Buffer) {
  if (!audio || audio.length === 0) {
    throw new ApiErrorResponse("音频数据为空，无法转码。", 400, "voice_transcode_empty");
  }

  const customExecutable = process.env.FFMPEG_PATH?.trim();
  const executable =
    customExecutable && customExecutable.length > 0 ? customExecutable : (ffmpegBinary ?? "ffmpeg");

  return new Promise<Buffer>((resolve, reject) => {
    const outputChunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];
    const ffmpeg = spawn(
      executable,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "pipe:1",
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    ffmpeg.stdout.on("data", (chunk) => {
      outputChunks.push(Buffer.from(chunk));
    });

    ffmpeg.stderr.on("data", (chunk) => {
      errorChunks.push(Buffer.from(chunk));
    });

    ffmpeg.on("error", (error) => {
      reject(
        new ApiErrorResponse(
          "音频转码失败，请确认已安装 ffmpeg。",
          500,
          "voice_transcode_spawn_error",
          {
            error: error.message,
          }
        )
      );
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(
          new ApiErrorResponse(
            "音频转码失败，请稍后重试。",
            500,
            "voice_transcode_failed",
            errorChunks.length > 0 ? Buffer.concat(errorChunks).toString("utf-8") : undefined
          )
        );
        return;
      }
      resolve(Buffer.concat(outputChunks));
    });

    ffmpeg.stdin.write(audio);
    ffmpeg.stdin.end();
  });
}

function buildIflytekWsUrl(baseUrlRaw: string, apiKey: string, apiSecret: string) {
  const normalizedUrl = normalizeWsUrl(baseUrlRaw);
  const url = new URL(normalizedUrl);
  const host = url.host;
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${url.pathname} HTTP/1.1`;
  const signatureSha = createHmac("sha256", apiSecret).update(signatureOrigin).digest("base64");
  const authorization = Buffer.from(
    `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`
  ).toString("base64");
  url.searchParams.set("authorization", authorization);
  url.searchParams.set("date", date);
  url.searchParams.set("host", host);
  return url.toString();
}

function normalizeWsUrl(candidate: string) {
  if (!candidate) {
    return "wss://iat-api.xfyun.cn/v2/iat";
  }
  if (candidate.startsWith("ws://") || candidate.startsWith("wss://")) {
    return candidate;
  }
  if (candidate.startsWith("http://")) {
    return `ws://${candidate.slice("http://".length)}`;
  }
  if (candidate.startsWith("https://")) {
    return `wss://${candidate.slice("https://".length)}`;
  }
  return candidate.includes("://") ? candidate : `wss://${candidate}`;
}

async function streamIflytekRecognition({
  url,
  appId,
  business,
  audio,
  timeoutMs,
}: {
  url: string;
  appId: string;
  business: Record<string, unknown>;
  audio: Buffer;
  timeoutMs: number;
}) {
  const WebSocketCtor = resolveWebSocket();
  const chunkSizeCandidate = Number(process.env.IFLYTEK_WS_CHUNK_SIZE);
  const chunkSize =
    Number.isFinite(chunkSizeCandidate) && chunkSizeCandidate > 0 ? chunkSizeCandidate : 1280;
  const frameIntervalCandidate = Number(process.env.IFLYTEK_WS_FRAME_INTERVAL_MS);
  const frameInterval =
    Number.isFinite(frameIntervalCandidate) && frameIntervalCandidate > 0
      ? frameIntervalCandidate
      : 40;
  const frames = createAudioFrames(audio, chunkSize);
  const aggregator = new IflytekTranscriptAggregator();

  return new Promise<string>((resolve, reject) => {
    let closed = false;
    let frameIndex = 0;
    const ws = new WebSocketCtor(url);

    const timeoutHandle = setTimeout(() => {
      cleanup(new ApiErrorResponse("语音识别超时，请稍后重试。", 504, "voice_provider_timeout"));
    }, timeoutMs);

    const cleanup = (error?: ApiErrorResponse, value?: string) => {
      if (closed) return;
      closed = true;
      clearTimeout(timeoutHandle);
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (error) {
        reject(error);
      } else if (value) {
        resolve(value);
      } else {
        reject(
          new ApiErrorResponse("语音识别过程中出现异常，请稍后再试。", 502, "voice_provider_error")
        );
      }
    };

    ws.addEventListener("open", () => {
      const sendNext = () => {
        if (frameIndex >= frames.length) {
          sendFinalFrame();
          return;
        }
        const chunk = frames[frameIndex];
        const payload: Record<string, unknown> = {
          data: {
            status: frameIndex === 0 ? 0 : 1,
            format: "audio/L16;rate=16000",
            encoding: "raw",
            audio: chunk.length > 0 ? chunk.toString("base64") : "",
          },
        };
        if (frameIndex === 0) {
          payload.common = { app_id: appId };
          payload.business = business;
        }
        ws.send(JSON.stringify(payload));
        frameIndex += 1;
        setTimeout(sendNext, frameInterval);
      };

      const sendFinalFrame = () => {
        const payload = {
          data: {
            status: 2,
            format: "audio/L16;rate=16000",
            encoding: "raw",
            audio: "",
          },
        };
        ws.send(JSON.stringify(payload));
      };

      sendNext();
    });

    ws.addEventListener("message", (event) => {
      let rawPayload: string;
      try {
        if (typeof event.data === "string") {
          rawPayload = event.data;
        } else if (event.data instanceof ArrayBuffer) {
          rawPayload = Buffer.from(event.data).toString("utf-8");
        } else if (ArrayBuffer.isView(event.data)) {
          rawPayload = Buffer.from(
            event.data.buffer,
            event.data.byteOffset,
            event.data.byteLength
          ).toString("utf-8");
        } else {
          rawPayload = String(event.data ?? "");
        }
        const payload = JSON.parse(rawPayload);
        if (payload?.code !== 0) {
          cleanup(
            new ApiErrorResponse(
              payload?.message ?? "语音识别服务调用失败，请稍后重试。",
              502,
              "voice_provider_error",
              payload
            )
          );
          return;
        }

        const data = payload?.data;
        if (data?.result) {
          const resultsArray = Array.isArray(data.result) ? data.result : [data.result];
          resultsArray.forEach((result: unknown) => aggregator.add(result));
        }

        if (data?.status === 2) {
          const transcript = aggregator.buildTranscript();
          if (!transcript.trim()) {
            cleanup(
              new ApiErrorResponse(
                "语音识别服务未返回有效文本。",
                502,
                "voice_provider_empty",
                payload
              )
            );
            return;
          }
          cleanup(undefined, transcript.trim());
        }
      } catch (error) {
        const errorDetails =
          error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
        cleanup(
          new ApiErrorResponse(
            "语音识别服务返回异常数据，请稍后重试。",
            502,
            "voice_provider_invalid_payload",
            { error: errorDetails }
          )
        );
      }
    });

    ws.addEventListener("error", (event) => {
      cleanup(
        new ApiErrorResponse(
          "语音识别服务连接失败，请稍后重试。",
          502,
          "voice_provider_connection_error",
          event instanceof Error ? { message: event.message, stack: event.stack } : undefined
        )
      );
    });

    ws.addEventListener("close", () => {
      if (closed) return;
      cleanup(
        new ApiErrorResponse("语音识别服务连接已关闭，请重试。", 502, "voice_provider_disconnected")
      );
    });
  });
}

function createAudioFrames(audio: Buffer, chunkSize: number) {
  const frames: Buffer[] = [];
  if (!audio || audio.length === 0) {
    frames.push(Buffer.alloc(0));
    return frames;
  }
  for (let offset = 0; offset < audio.length; offset += chunkSize) {
    frames.push(audio.subarray(offset, Math.min(offset + chunkSize, audio.length)));
  }
  if (frames.length === 0) {
    frames.push(Buffer.alloc(0));
  }
  return frames;
}

class IflytekTranscriptAggregator {
  private segments = new Map<number, string>();

  add(result: unknown) {
    if (!result || typeof result !== "object") {
      return;
    }
    const typed = result as {
      sn?: number;
      pgs?: string;
      rg?: [number, number];
      ws?: Array<{ cw?: Array<{ w?: string }> }>;
    };

    const text = (typed.ws ?? [])
      .map((wsItem) => wsItem.cw?.map((candidate) => candidate.w ?? "").join("") ?? "")
      .join("");

    if (!text) {
      return;
    }

    if (typed.pgs === "rpl" && Array.isArray(typed.rg) && typed.rg.length === 2) {
      for (let sn = typed.rg[0]; sn <= typed.rg[1]; sn += 1) {
        this.segments.delete(sn);
      }
    }

    const key = typeof typed.sn === "number" ? typed.sn : this.segments.size;
    this.segments.set(key, text);
  }

  buildTranscript() {
    return Array.from(this.segments.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value)
      .join("");
  }
}

function resolveWebSocket(): typeof WebSocket {
  if (typeof globalThis.WebSocket === "function") {
    return globalThis.WebSocket;
  }
  throw new ApiErrorResponse(
    "当前运行环境不支持 WebSocket，请升级 Node 版本或引入 polyfill。",
    500,
    "voice_ws_unavailable"
  );
}
