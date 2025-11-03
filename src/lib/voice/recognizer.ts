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

  if (mimeType && !mimeType.startsWith("audio/")) {
    console.warn(`[voice] 收到非音频 MIME 类型：${mimeType}`);
  }

  const provider =
    process.env.VOICE_RECOGNIZER_PROVIDER?.toLowerCase()?.trim() ??
    process.env.VOICE_RECOGNIZER_MODE?.toLowerCase()?.trim() ??
    "mock";

  if (provider !== "mock") {
    console.warn(
      `[voice] 未实现的语音识别提供方：${provider}，默认回退至 mock。请在 recognizeVoice 中实现真实调用。`
    );
  }

  const transcript =
    (transcriptHint && transcriptHint.trim()) ||
    process.env.VOICE_RECOGNIZER_MOCK_TRANSCRIPT?.trim() ||
    "（示例）请接入真实语音识别服务以获得准确文本。";

  const intent = inferIntent(purpose, transcript);
  const expenseDraft = intent === "expense" ? inferExpenseDraft(transcript) : undefined;

  return {
    transcript,
    intent,
    expenseDraft,
  };
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
