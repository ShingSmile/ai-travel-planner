import { ItineraryPromptContext, type LLMMessage } from "./types";

function formatBudget(budget?: number) {
  if (typeof budget !== "number" || Number.isNaN(budget)) {
    return "未提供";
  }
  return `${budget.toFixed(0)} 元（人民币，可根据实际情况稍作浮动）`;
}

function formatTravelers(travelers: ItineraryPromptContext["travelers"]) {
  if (!travelers?.length) {
    return "未提供详细同行人信息，默认以 2 位成人为参考。";
  }

  const items = travelers
    .map((traveler, index) => {
      const role = traveler.role ? `（${traveler.role}）` : "";
      const age = typeof traveler.age === "number" ? `，年龄 ${traveler.age}` : "";
      const displayName = traveler.name || `旅伴 ${index + 1}`;
      return `${displayName}${role}${age}`;
    })
    .join("；");

  return items;
}

function formatTags(tags?: string[]) {
  if (!tags?.length) return "未提供重点标签，可结合目的地热门体验自由发挥。";
  return tags.join("、");
}

function calculateDurationDays(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf())) {
    return 1;
  }
  const diff = end.getTime() - start.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  return Number.isFinite(days) && days > 0 ? days : 1;
}

const systemPrompt = `你是一名资深中文旅行策划师，擅长根据用户的目的地、预算、旅伴和喜好生成结构化、可执行的行程方案。
请始终：
1. 依据中国大陆常见消费水平给出合理预算估算；
2. 为每日安排提供明确的时间段、地点和活动说明，兼顾动静结合；
3. 输出内容使用简体中文，语气专业而亲和；
4. 若信息不足，给出适当假设并在备注中说明。`;

export function buildItineraryPromptMessages(context: ItineraryPromptContext): LLMMessage[] {
  const durationDays = calculateDurationDays(context.startDate, context.endDate);

  const preferenceSummary = [
    context.travelStyle ? `旅行风格：${context.travelStyle}` : null,
    context.notes ? `备注：${context.notes}` : null,
  ]
    .filter(Boolean)
    .join("\\n");

  const userPrompt = `请基于以下用户输入生成旅行规划 JSON，并严格匹配提供的 JSON Schema。
基础信息：
- 行程标题：${context.title}
- 目的地：${context.destination}
- 行程日期：${context.startDate} 至 ${context.endDate}（共 ${durationDays} 天）
- 参考预算：${formatBudget(context.budget)}
- 同行人：${formatTravelers(context.travelers)}
- 自定义标签：${formatTags(context.tags)}
${preferenceSummary ? `- 额外偏好说明：${preferenceSummary}` : ""}

输出要求：
1. 严格按照 Schema 字段命名输出，仅包含 Schema 定义的字段；
2. 每日安排至少包含 3 个活动，包含起止时间、地点、概要与小贴士；
3. 预算 breakdown 至少覆盖住宿、餐饮、交通、娱乐/门票四类；
4. 若预算无法精确估算，可给出区间或说明假设前提；
5. 最终仅输出合法 JSON，不得包含 Markdown 或额外解释。`;

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];
}
