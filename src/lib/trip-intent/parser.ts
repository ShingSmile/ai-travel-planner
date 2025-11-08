import type {
  TripIntentDraft,
  TripIntentFieldKey,
  TripIntentSource,
  TripIntentBudget,
  TripIntentDateRange,
  TripIntentTravelParty,
} from "@/types/trip-intent";

const destinationDictionary = [
  "日本",
  "东京",
  "大阪",
  "京都",
  "冲绳",
  "北海道",
  "福冈",
  "名古屋",
  "中国",
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "成都",
  "重庆",
  "西安",
  "武汉",
  "长沙",
  "厦门",
  "青岛",
  "大理",
  "丽江",
  "三亚",
  "海南",
  "张家界",
  "香港",
  "澳门",
  "台湾",
  "台北",
  "台中",
  "花莲",
  "高雄",
  "台南",
  "韩国",
  "首尔",
  "釜山",
  "济州",
  "泰国",
  "曼谷",
  "清迈",
  "普吉",
  "越南",
  "岘港",
  "芽庄",
  "新加坡",
  "马来西亚",
  "吉隆坡",
  "槟城",
  "巴厘岛",
  "印尼",
  "菲律宾",
  "宿务",
  "薄荷岛",
  "欧洲",
  "法国",
  "巴黎",
  "意大利",
  "罗马",
  "英国",
  "伦敦",
  "美国",
  "纽约",
  "洛杉矶",
  "澳大利亚",
  "悉尼",
  "墨尔本",
];

const preferenceKeywords: Array<{ tag: string; keywords: RegExp[] }> = [
  { tag: "美食", keywords: [/美食/, /吃/, /餐厅/, /料理/] },
  { tag: "动漫", keywords: [/动漫/, /二次元/, /动画/] },
  { tag: "亲子", keywords: [/亲子/, /孩子/, /宝宝/, /带娃/, /小朋友/] },
  { tag: "自然", keywords: [/自然/, /山/, /海/, /徒步/, /户外/] },
  { tag: "文化", keywords: [/文化/, /博物馆/, /历史/, /打卡/] },
  { tag: "购物", keywords: [/购物/, /买买买/, /买东西/, /商场/] },
  { tag: "放松", keywords: [/度假/, /放松/, /休闲/, /发呆/] },
  { tag: "摄影", keywords: [/拍照/, /摄影/, /写真/] },
  { tag: "夜生活", keywords: [/夜生活/, /酒吧/, /夜店/] },
  { tag: "海岛", keywords: [/海岛/, /潜水/, /浮潜/, /沙滩/] },
];

const currencyTokens: Record<string, string> = {
  元: "CNY",
  块: "CNY",
  人民币: "CNY",
  rmb: "CNY",
  cny: "CNY",
  美元: "USD",
  usd: "USD",
  美金: "USD",
  日元: "JPY",
  jpy: "JPY",
  欧元: "EUR",
  eur: "EUR",
  港币: "HKD",
  hkd: "HKD",
};

const durationRegex = /(\d+(?:\.\d+)?)\s*(?:天|日)/i;
const rangeRegex = /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/gi;
const fieldWeights: Record<TripIntentFieldKey, number> = {
  destination: 0.25,
  date: 0.2,
  budget: 0.2,
  travelers: 0.2,
  preferences: 0.15,
};

export interface ParseTripIntentOptions {
  source?: TripIntentSource;
  transcriptId?: string;
  voiceInputId?: string | null;
}

export function parseTripIntent(
  rawInput: string,
  options?: ParseTripIntentOptions
): TripIntentDraft {
  const normalized = rawInput?.trim() ?? "";
  if (!normalized) {
    throw new Error("无法解析空白描述。");
  }

  const now = new Date();
  const baseYear = now.getFullYear();
  const cleaned = normalized.replace(/\s+/g, " ");

  const destinations = extractDestinations(cleaned);
  const dateRange = extractDateRange(cleaned, baseYear);
  const budget = extractBudget(cleaned);
  const travelParty = extractTravelParty(cleaned);
  const preferences = extractPreferences(cleaned);

  const fieldConfidences: Record<TripIntentFieldKey, number> = {
    destination: destinations.length > 0 ? 0.85 : 0,
    date:
      dateRange?.startDate || dateRange?.endDate || dateRange?.durationDays
        ? computeDateConfidence(dateRange)
        : 0,
    budget: budget ? 0.8 : 0,
    travelers:
      travelParty?.total || travelParty?.hasKids ? computeTravelerConfidence(travelParty) : 0,
    preferences: preferences.length > 0 ? Math.min(0.6 + preferences.length * 0.08, 0.9) : 0,
  };

  const confidence = (Object.keys(fieldWeights) as TripIntentFieldKey[]).reduce((sum, key) => {
    const fieldScore = fieldConfidences[key] ?? 0;
    return sum + fieldScore * fieldWeights[key];
  }, 0);

  return {
    id: generateDraftId(),
    source: options?.source ?? "text",
    rawInput: cleaned,
    voiceInputId: options?.voiceInputId ?? undefined,
    destinations,
    dateRange,
    budget,
    travelParty,
    preferences,
    confidence: Number(confidence.toFixed(3)),
    fieldConfidences,
    transcriptId: options?.transcriptId ?? undefined,
    createdAt: new Date().toISOString(),
  };
}

function extractDestinations(text: string) {
  const matches = new Set<string>();
  for (const keyword of destinationDictionary) {
    if (text.includes(keyword)) {
      matches.add(keyword);
    }
  }

  const intentRegex = /(?:去|到|想去|准备去|飞往)([^，。,；;!?！\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = intentRegex.exec(text))) {
    const fragment = match[1];
    fragment
      .split(/[和及、,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        matches.add(stripDestinationSuffix(item));
      });
  }

  return Array.from(matches);
}

function stripDestinationSuffix(value: string) {
  return value.replace(/(玩|旅游|旅行|行|逛逛|看看|待几天)$/i, "");
}

function extractDateRange(text: string, baseYear: number): TripIntentDateRange | undefined {
  const dates: string[] = [];
  let match: RegExpExecArray | null;
  rangeRegex.lastIndex = 0;

  while ((match = rangeRegex.exec(text))) {
    const [, year, monthRaw, dayRaw] = match;
    const yearNum = year ? parseInt(year, 10) : baseYear;
    const month = parseInt(monthRaw, 10);
    const day = parseInt(dayRaw, 10);
    const iso = toISODate(yearNum, month, day);
    if (iso) {
      dates.push(iso);
    }
  }

  const durationMatch = durationRegex.exec(text);
  const durationDays = durationMatch ? Number(durationMatch[1]) : undefined;

  if (dates.length === 0 && !durationDays) {
    return undefined;
  }

  if (dates.length >= 2) {
    const [startDate, endDate] = normalizeDateOrder(dates[0], dates[1]);
    return {
      startDate,
      endDate,
      durationDays: durationDays ?? computeDurationDays(startDate, endDate),
      text: `${startDate} - ${endDate}`,
    };
  }

  if (dates.length === 1) {
    return {
      startDate: dates[0],
      endDate: undefined,
      durationDays,
      text: durationDays ? `${dates[0]} 起，${durationDays} 天` : dates[0],
    };
  }

  return {
    durationDays,
    text: durationDays ? `${durationDays} 天` : undefined,
  };
}

function extractBudget(text: string): TripIntentBudget | undefined {
  const keywordRegex =
    /(预算|控制在|最多|大约|大概|预计|花费|花个|打算花|准备花)\D*(\d+(?:\.\d+)?)(?:\s*(万|千|百)?)\s*(元|块|人民币|rmb|cny|美元|usd|美金|日元|jpy|欧元|eur|港币|hkd)?/i;
  const currencyRegex =
    /(\d+(?:\.\d+)?)(?:\s*(万|千|百)?)\s*(元|块|人民币|rmb|cny|美元|usd|美金|日元|jpy|欧元|eur|港币|hkd)/i;

  const keywordMatch = keywordRegex.exec(text);
  const currencyMatch = keywordMatch ? null : currencyRegex.exec(text);
  const match = keywordMatch ?? currencyMatch;
  if (!match) return undefined;

  const amountRaw = keywordMatch ? match[2] : match[1];
  const unitRaw = keywordMatch ? match[3] : match[2];
  const currencyRaw = keywordMatch ? match[4] : match[3];
  const unitMultiplier = resolveUnit(unitRaw);
  const baseAmount = Number(amountRaw);
  if (Number.isNaN(baseAmount)) {
    return undefined;
  }

  const amount = baseAmount * unitMultiplier;
  const currency = resolveCurrency(currencyRaw);

  return {
    amount: Math.round(amount * 100) / 100,
    currency,
    text: match[0].trim(),
  };
}

function extractTravelParty(text: string): TripIntentTravelParty | undefined {
  const result: TripIntentTravelParty = {};
  const familyMatch = /一家(\d+)口/.exec(text);
  if (familyMatch) {
    result.total = Number(familyMatch[1]);
    result.hasKids = result.total >= 3;
  }

  const patternAdultChild = /(\d+)\s*大\s*(\d+)\s*小/.exec(text);
  if (patternAdultChild) {
    result.adults = Number(patternAdultChild[1]);
    result.kids = Number(patternAdultChild[2]);
    result.total = (result.adults ?? 0) + (result.kids ?? 0);
    result.hasKids = (result.kids ?? 0) > 0;
  }

  const peopleMatch = /(\d+)\s*人/.exec(text);
  if (peopleMatch && !result.total) {
    result.total = Number(peopleMatch[1]);
  }

  if (/带(着)?(宝宝|孩子|娃|小朋友)/.test(text)) {
    result.hasKids = true;
    if (!result.kids) {
      result.kids = 1;
    }
  }

  if (!result.total && result.hasKids) {
    result.total = (result.kids ?? 1) + 1;
  }

  if (
    result.total === undefined &&
    (text.includes("情侣") || text.includes("夫妻") || /我们俩|两个人/.test(text))
  ) {
    result.total = 2;
  }

  if (!result.total && !result.hasKids && text.includes("一个人")) {
    result.total = 1;
  }

  if (!result.total && !result.hasKids) {
    return undefined;
  }

  result.description = buildTravelPartyDescription(result);
  return result;
}

function extractPreferences(text: string) {
  const tags = new Set<string>();
  for (const { tag, keywords } of preferenceKeywords) {
    if (keywords.some((regex) => regex.test(text))) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

function resolveUnit(unitRaw?: string | null) {
  if (!unitRaw) return 1;
  if (unitRaw.includes("万")) return 10000;
  if (unitRaw.includes("千")) return 1000;
  if (unitRaw.includes("百")) return 100;
  return 1;
}

function resolveCurrency(token?: string | null) {
  if (!token) return "CNY";
  const normalized = token.toLowerCase();
  return currencyTokens[normalized] ?? currencyTokens[token] ?? "CNY";
}

function toISODate(year: number, month: number, day: number) {
  if (!year || !month || !day) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function normalizeDateOrder(start: string, end: string): [string, string] {
  if (start <= end) return [start, end];
  return [end, start];
}

function computeDurationDays(start?: string, end?: string) {
  if (!start || !end) return undefined;
  const diff = Math.abs(Date.parse(end) - Date.parse(start));
  if (Number.isNaN(diff)) return undefined;
  return Math.round(diff / (24 * 60 * 60 * 1000)) + 1;
}

function computeDateConfidence(range?: TripIntentDateRange) {
  if (!range) return 0;
  if (range.startDate && range.endDate) return 0.85;
  if (range.startDate || range.endDate) return 0.6;
  if (range.durationDays) return 0.4;
  return 0.2;
}

function computeTravelerConfidence(party?: TripIntentTravelParty) {
  if (!party) return 0;
  if (party.total && party.kids !== undefined) {
    return 0.85;
  }
  if (party.total) return 0.7;
  if (party.hasKids) return 0.5;
  return 0.3;
}

function buildTravelPartyDescription(party: TripIntentTravelParty) {
  const pieces: string[] = [];
  if (party.total) {
    pieces.push(`${party.total} 人`);
  }
  if (party.adults !== undefined && party.kids !== undefined) {
    pieces.push(`${party.adults} 大 ${party.kids} 小`);
  } else if (party.hasKids) {
    pieces.push("包含儿童");
  }
  return pieces.join(" / ");
}

function generateDraftId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `trip-intent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
