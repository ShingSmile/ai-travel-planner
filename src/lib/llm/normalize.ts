import type { ItineraryPromptContext, StructuredTripPlan } from "./types";

type AnyRecord = Record<string, unknown>;

const NORMALIZATION_FALLBACKS_ENABLED = resolveFallbackToggle();

export function normalizeStructuredTripPlanPayload(
  payload: unknown,
  context?: ItineraryPromptContext
) {
  if (!isRecord(payload)) {
    return payload;
  }

  const plan = payload as AnyRecord;
  const overviewSource = resolveOverviewSource(plan, context);
  const fallbackStartDate =
    normalizeDateString(resolveOverviewStartDate(overviewSource)) ??
    normalizeDateString(resolvePlanStartDate(plan));
  const daySource = resolveDaySource(plan);
  const normalizedDays = normalizeDays(prepareDayEntries(daySource), fallbackStartDate, context);
  plan.days = normalizedDays;

  if (overviewSource) {
    plan.overview = normalizeOverview(overviewSource, normalizedDays, context);
  } else {
    delete plan.overview;
  }

  const budgetSource = resolveBudgetSource(
    plan.budget ?? deriveBudgetFromPlan(plan),
    context,
    plan
  );
  if (budgetSource) {
    plan.budget = normalizeBudget(budgetSource);
  } else {
    delete plan.budget;
  }

  if ("suggestions" in plan) {
    const suggestions = normalizeStringList(plan.suggestions);
    if (suggestions !== undefined) {
      plan.suggestions = suggestions;
    }
  }

  return plan as unknown as StructuredTripPlan;
}

function normalizeOverview(
  overview: AnyRecord,
  days: StructuredTripPlan["days"],
  context?: ItineraryPromptContext
) {
  const startDate = normalizeDateString(overview.startDate ?? overview.start_date);
  if (startDate) {
    overview.startDate = startDate;
  }

  const endDate = normalizeDateString(overview.endDate ?? overview.end_date);
  if (endDate) {
    overview.endDate = endDate;
  }

  const normalizedTotalDays = coerceInteger(overview.totalDays);
  if (!normalizedTotalDays || Number.isNaN(normalizedTotalDays)) {
    const fromDays = days.length > 0 ? days.length : undefined;
    const fromDates = deriveDurationDays(
      typeof overview.startDate === "string" ? overview.startDate : startDate,
      typeof overview.endDate === "string" ? overview.endDate : endDate
    );
    const fallback = fromDays ?? fromDates;
    if (fallback) {
      overview.totalDays = fallback;
    }
  }

  if (!overview.title) {
    if (context?.title && NORMALIZATION_FALLBACKS_ENABLED) {
      overview.title = context.title;
    } else if (NORMALIZATION_FALLBACKS_ENABLED) {
      overview.title = "AI 旅行计划";
    }
  }

  if (!overview.destination && context?.destination && NORMALIZATION_FALLBACKS_ENABLED) {
    overview.destination = context.destination;
  }

  if (!overview.summary && NORMALIZATION_FALLBACKS_ENABLED) {
    overview.summary = buildFallbackSummary(context);
  }

  if (!overview.travelStyle && context?.travelStyle && NORMALIZATION_FALLBACKS_ENABLED) {
    overview.travelStyle = context.travelStyle;
  }

  return overview as unknown as StructuredTripPlan["overview"];
}

function normalizeDays(
  value: unknown,
  fallbackStartDate?: string,
  context?: ItineraryPromptContext
): StructuredTripPlan["days"] {
  if (!Array.isArray(value)) {
    if (NORMALIZATION_FALLBACKS_ENABLED) {
      return buildFallbackDays(context, fallbackStartDate);
    }
    return [];
  }

  const normalized: StructuredTripPlan["days"] = [];

  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      return;
    }
    const day = entry as AnyRecord;
    const coercedDay = coerceInteger(day.day);
    if (coercedDay) {
      day.day = coercedDay;
    } else {
      day.day = index + 1;
    }

    const normalizedDate = normalizeDateString(day.date);
    if (normalizedDate) {
      day.date = normalizedDate;
    } else if (fallbackStartDate) {
      const derived = deriveNextDate(fallbackStartDate, index);
      if (derived) {
        day.date = derived;
      }
    }

    const notes = normalizeStringList(day.notes);
    if (notes !== undefined) {
      day.notes = notes;
    }

    const resolvedTitle = resolveDayTitle(day, index, context);
    if (resolvedTitle) {
      day.title = resolvedTitle;
    }

    day.activities = normalizeActivityList(day.activities);
    if (Array.isArray(day.activities) && day.activities.length === 0) {
      if (!NORMALIZATION_FALLBACKS_ENABLED) {
        day.activities = [];
      } else {
        day.activities = [
          createPlaceholderActivity(
            typeof day.title === "string" ? day.title : `第 ${index + 1} 天`,
            day.date as string | undefined
          ),
        ];
      }
    }

    if ("meals" in day) {
      day.meals = normalizeActivityList(day.meals);
      if (Array.isArray(day.meals) && day.meals.length === 0) {
        delete day.meals;
      }
    }

    if (isRecord(day.accommodations)) {
      const normalizedAccommodation = normalizeAccommodation(day.accommodations as AnyRecord);
      if (normalizedAccommodation) {
        day.accommodations = normalizedAccommodation;
      } else {
        delete day.accommodations;
      }
    }

    const resolvedSummary = resolveDaySummary(day, index);
    if (resolvedSummary) {
      day.summary = resolvedSummary;
    }

    normalized.push(day as unknown as StructuredTripPlan["days"][number]);
  });

  if (normalized.length === 0) {
    if (NORMALIZATION_FALLBACKS_ENABLED) {
      return buildFallbackDays(context, fallbackStartDate);
    }
    return [];
  }

  return normalized;
}

function normalizeActivityList(value: unknown, fallbackCurrency?: string) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((entry) => {
      const activity = entry as AnyRecord;
      const name = normalizeString(activity.name);
      if (name) {
        activity.name = name;
      }

      const type = normalizeString(activity.type);
      if (type) {
        activity.type = type;
      }

      const summary = normalizeString(activity.summary);
      if (summary) {
        activity.summary = summary;
      }

      const location = normalizeString(activity.location);
      if (location) {
        activity.location = location;
      }

      const { start, end } = normalizeTimeRange(activity);
      if (start) {
        activity.startTime = start;
      }
      if (end) {
        activity.endTime = end;
      }

      const tips = normalizeStringList(activity.tips);
      if (tips !== undefined) {
        activity.tips = tips;
      }

      if (isRecord(activity.budget)) {
        const normalizedBudget = normalizeMoney(activity.budget as AnyRecord);
        if (normalizedBudget) {
          activity.budget = normalizedBudget;
        } else {
          delete activity.budget;
        }
      } else if (activity.budget !== undefined) {
        const normalizedBudget = normalizeEmbeddedBudget(activity.budget, fallbackCurrency);
        if (normalizedBudget) {
          activity.budget = normalizedBudget;
        } else {
          delete activity.budget;
        }
      } else {
        const derivedBudget = deriveActivityBudget(activity, fallbackCurrency);
        if (derivedBudget) {
          activity.budget = derivedBudget;
        }
      }

      return activity;
    })
    .filter(
      (activity) =>
        typeof activity.name === "string" &&
        activity.name.trim().length > 0 &&
        typeof activity.type === "string" &&
        activity.type.trim().length > 0
    );
}

function normalizeAccommodation(value: AnyRecord) {
  const name = normalizeString(value.name);
  if (!name) {
    return null;
  }
  value.name = name;

  const address = normalizeString(value.address);
  if (address) {
    value.address = address;
  } else {
    delete value.address;
  }

  const checkIn = normalizeTimeString(value.checkInTime ?? value.check_in_time);
  if (checkIn) {
    value.checkInTime = checkIn;
  } else {
    delete value.checkInTime;
  }

  const checkOut = normalizeTimeString(value.checkOutTime ?? value.check_out_time);
  if (checkOut) {
    value.checkOutTime = checkOut;
  } else {
    delete value.checkOutTime;
  }

  if (isRecord(value.budget)) {
    const normalizedBudget = normalizeMoney(value.budget as AnyRecord);
    if (normalizedBudget) {
      value.budget = normalizedBudget;
    } else {
      delete value.budget;
    }
  }

  return value;
}

function normalizeBudget(budget: AnyRecord) {
  const normalizedBudget: AnyRecord = isRecord(budget) ? { ...budget } : {};
  const normalizedCurrency = normalizeString(normalizedBudget.currency);
  if (normalizedCurrency) {
    normalizedBudget.currency = normalizedCurrency;
  } else if (NORMALIZATION_FALLBACKS_ENABLED) {
    normalizedBudget.currency = "CNY";
  } else {
    delete normalizedBudget.currency;
  }
  const total = coerceNumber(normalizedBudget.total ?? normalizedBudget.amount);
  if (total !== null) {
    normalizedBudget.total = total;
  } else if (
    normalizedBudget.currency &&
    normalizedBudget.total === undefined &&
    NORMALIZATION_FALLBACKS_ENABLED
  ) {
    normalizedBudget.total = 0;
  }

  const breakdown = normalizeBudgetBreakdown(
    normalizedBudget.breakdown,
    typeof normalizedBudget.total === "number" ? normalizedBudget.total : undefined
  );
  if (breakdown.length > 0) {
    normalizedBudget.breakdown = breakdown;
  }

  const tips = normalizeStringList(normalizedBudget.tips);
  if (tips !== undefined) {
    normalizedBudget.tips = tips;
  }

  return normalizedBudget as unknown as StructuredTripPlan["budget"];
}

function normalizeBudgetBreakdown(value: unknown, total?: number) {
  if (Array.isArray(value)) {
    const normalizedFromArray = value
      .filter(isRecord)
      .map((item) => {
        const category = normalizeString(item.category);
        const amount = coerceNumber(item.amount);
        if (!category || amount === null) {
          return null;
        }
        const normalizedItem: AnyRecord = { category, amount };
        const description = normalizeString(item.description);
        if (description) {
          normalizedItem.description = description;
        }
        const percentage = coerceNumber(item.percentage);
        if (percentage !== null) {
          normalizedItem.percentage = clamp(percentage, 0, 100);
        }
        return normalizedItem;
      })
      .filter((item): item is AnyRecord => !!item);

    if (normalizedFromArray.length > 0) {
      return normalizedFromArray;
    }
  }

  if (isRecord(value)) {
    const normalizedFromRecord = Object.entries(value)
      .map(([key, entryValue]) => normalizeBudgetBreakdownRecordEntry(key, entryValue))
      .filter((item): item is AnyRecord => !!item);

    if (normalizedFromRecord.length > 0) {
      return normalizedFromRecord;
    }
  }

  if (typeof total === "number" && Number.isFinite(total) && NORMALIZATION_FALLBACKS_ENABLED) {
    return buildFallbackBreakdown(total);
  }

  return [];
}

function normalizeBudgetBreakdownRecordEntry(categoryKey: string, entryValue: unknown) {
  const category = normalizeString(categoryKey);
  if (!category) {
    return null;
  }

  if (isRecord(entryValue)) {
    const valueRecord = entryValue as AnyRecord;
    const amount = coerceNumber(valueRecord.amount ?? valueRecord.total ?? valueRecord.value);
    if (amount === null) {
      return null;
    }
    const normalized: AnyRecord = { category, amount };
    const description = normalizeString(valueRecord.description ?? valueRecord.note);
    if (description) {
      normalized.description = description;
    }
    const percentage = coerceNumber(
      valueRecord.percentage ?? valueRecord.percent ?? valueRecord.ratio
    );
    if (percentage !== null) {
      normalized.percentage = clamp(percentage, 0, 100);
    }
    return normalized;
  }

  const amount = coerceNumber(entryValue);
  if (amount === null) {
    return null;
  }

  return { category, amount };
}

function normalizeMoney(value: AnyRecord) {
  const amount = coerceNumber(value.amount ?? value.total ?? value.value);
  if (amount === null) {
    return null;
  }
  const currency = normalizeString(value.currency) ?? "CNY";
  const description = normalizeString(value.description ?? value.desc ?? value.note);
  const normalized: AnyRecord = {
    amount,
    currency,
  };
  if (description) {
    normalized.description = description;
  }
  return normalized;
}

function normalizeEmbeddedBudget(value: unknown, fallbackCurrency?: string) {
  if (isRecord(value)) {
    return normalizeMoney(value as AnyRecord);
  }
  const amount = coerceNumber(value);
  if (amount === null) {
    return null;
  }
  return {
    amount,
    currency: normalizeString(fallbackCurrency) ?? "CNY",
  };
}

function deriveActivityBudget(activity: AnyRecord, fallbackCurrency?: string) {
  const amount = coerceNumber(
    activity.cost ??
      activity.price ??
      activity.estimatedCost ??
      activity.amount ??
      activity.budgetAmount
  );
  if (amount === null) {
    return null;
  }
  const description = normalizeString(
    activity.costNote ??
      activity.priceNote ??
      activity.budgetNote ??
      activity.description ??
      activity.summary
  );
  const currency =
    normalizeString(activity.currency ?? activity.budgetCurrency ?? fallbackCurrency) ?? "CNY";
  const budget: AnyRecord = {
    amount,
    currency,
  };
  if (description) {
    budget.description = description;
  }
  return budget;
}

function normalizeStringList(value: unknown): string[] | null | undefined {
  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeString(item))
      .filter((item): item is string => !!item);
    return normalized.length > 0 ? normalized : [];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    const fragments = trimmed
      .split(/[\n,;；、]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return fragments.length > 0 ? fragments : [trimmed];
  }

  return undefined;
}

function normalizeTimeRange(value: AnyRecord) {
  const start = normalizeTimeString(value.startTime);
  const end = normalizeTimeString(value.endTime);
  if (start || end) {
    return { start, end };
  }

  const source =
    normalizeString(value.timeRange) ??
    normalizeString(value.timerange) ??
    normalizeString(value.time);
  if (!source) {
    return { start: undefined, end: undefined };
  }

  const [maybeStart, maybeEnd] = source
    .split(/[-~～至到]/)
    .map((item) => normalizeTimeString(item));
  return {
    start: maybeStart,
    end: maybeEnd,
  };
}

function normalizeDateString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const sanitized = trimmed.replace(/[/.]/g, "-");
  const match = sanitized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    return undefined;
  }
  const [, year, month, day] = match;
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return undefined;
  }
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d
    .toString()
    .padStart(2, "0")}`;
}

function normalizeTimeString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) {
    return undefined;
  }
  const hour = clamp(Number.parseInt(match[1], 10), 0, 23);
  const minute = match[2] ? clamp(Number.parseInt(match[2], 10), 0, 59) : 0;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function normalizeString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return undefined;
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return null;
    }
    const parsed = Number.parseFloat(match[0]);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function coerceInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function deriveDurationDays(start?: string, end?: string) {
  if (!start || !end) {
    return undefined;
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) {
    return undefined;
  }
  const diff = endDate.getTime() - startDate.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  return days > 0 ? days : undefined;
}

function deriveNextDate(startDate: string, offset: number) {
  const base = new Date(startDate);
  if (Number.isNaN(base.valueOf())) {
    return undefined;
  }
  base.setDate(base.getDate() + offset);
  return `${base.getFullYear().toString().padStart(4, "0")}-${(base.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${base.getDate().toString().padStart(2, "0")}`;
}

function getTodayISODate() {
  const today = new Date();
  return `${today.getFullYear().toString().padStart(4, "0")}-${(today.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${today.getDate().toString().padStart(2, "0")}`;
}

function resolveOverviewStartDate(overview?: AnyRecord) {
  if (!overview) {
    return undefined;
  }
  if (typeof overview.startDate === "string") {
    return overview.startDate;
  }
  if (typeof overview.start_date === "string") {
    return overview.start_date as string;
  }
  return undefined;
}

function resolveOverviewSource(plan: AnyRecord, context?: ItineraryPromptContext) {
  if (isRecord(plan.overview) && Object.keys(plan.overview as AnyRecord).length > 0) {
    return plan.overview as AnyRecord;
  }

  const candidate: AnyRecord = {};
  const title =
    normalizeString(plan.title ?? plan.tripTitle ?? plan.name) ?? normalizeString(context?.title);
  if (title) {
    candidate.title = title;
  }

  const destination =
    normalizeString(plan.destination ?? plan.city ?? plan.region ?? plan.country) ??
    normalizeString(context?.destination);
  if (destination) {
    candidate.destination = destination;
  }

  const startDate =
    normalizeDateString(resolvePlanStartDate(plan)) ?? normalizeDateString(context?.startDate);
  if (startDate) {
    candidate.startDate = startDate;
  }

  const endDate =
    normalizeDateString(resolvePlanEndDate(plan)) ?? normalizeDateString(context?.endDate);
  if (endDate) {
    candidate.endDate = endDate;
  }

  const totalDays =
    coerceInteger(plan.totalDays ?? plan.duration ?? plan.durationDays) ??
    (Array.isArray(plan.days) && plan.days.length > 0
      ? plan.days.length
      : Array.isArray(plan.dailyItinerary) && plan.dailyItinerary.length > 0
        ? plan.dailyItinerary.length
        : undefined);
  if (totalDays) {
    candidate.totalDays = totalDays;
  }

  const travelStyle =
    normalizeString(plan.travelStyle ?? plan.style) ??
    (isRecord(plan.preferences)
      ? normalizeString(
          (plan.preferences as AnyRecord).travelStyle ??
            (plan.preferences as AnyRecord).pace ??
            (plan.preferences as AnyRecord).style
        )
      : undefined);
  if (travelStyle) {
    candidate.travelStyle = travelStyle;
  }

  const summaryCandidate =
    normalizeString(plan.summary) ??
    normalizeString(plan.overviewSummary) ??
    normalizeString(plan.notes) ??
    normalizeString(plan.description) ??
    normalizeString(context?.notes);
  if (summaryCandidate) {
    candidate.summary = summaryCandidate;
  } else {
    const derived = deriveSummaryFromOverviewCandidate(candidate);
    if (derived) {
      candidate.summary = derived;
    }
  }

  if ("summary" in candidate) {
    return candidate;
  }
  if (NORMALIZATION_FALLBACKS_ENABLED) {
    return buildFallbackOverview(context);
  }
  return undefined;
}

function resolvePlanStartDate(plan?: AnyRecord) {
  return resolvePlanDate(plan, "start");
}

function resolvePlanEndDate(plan?: AnyRecord) {
  return resolvePlanDate(plan, "end");
}

function resolvePlanDate(plan: AnyRecord | undefined, type: "start" | "end") {
  if (!plan) {
    return undefined;
  }
  const keys =
    type === "start"
      ? ["startDate", "start_date", "start", "from", "tripStart"]
      : ["endDate", "end_date", "end", "to", "tripEnd"];
  for (const key of keys) {
    const value = plan[key];
    if (typeof value === "string") {
      return value;
    }
  }
  const rangeCandidates = [plan.dateRange, plan.dates, plan.durationRange];
  for (const range of rangeCandidates) {
    if (isRecord(range)) {
      const value = range[type];
      if (typeof value === "string") {
        return value;
      }
    }
  }
  return undefined;
}

function deriveSummaryFromOverviewCandidate(overview: AnyRecord) {
  const destination = normalizeString(overview.destination);
  const start = normalizeString(overview.startDate);
  const end = normalizeString(overview.endDate);
  const totalDays = coerceInteger(overview.totalDays);
  if (!destination && !start && !end) {
    return undefined;
  }
  const parts = [
    destination ?? overview.title ?? "行程",
    start && end
      ? `（${start} 至 ${end}${totalDays ? `，共 ${totalDays} 天` : ""}）`
      : totalDays
        ? `（约 ${totalDays} 天）`
        : "",
  ].filter(Boolean);
  return parts.join("");
}

function resolveDaySource(plan: AnyRecord) {
  if (Array.isArray(plan.days) && plan.days.length > 0) {
    return plan.days;
  }
  const alternative = findFirstArray([
    plan.dailyItinerary,
    plan.daily_itinerary,
    plan.itinerary,
    plan.dailyPlans,
    plan.daily_plans,
    plan.plan,
  ]);
  return alternative ?? plan.days;
}

function prepareDayEntries(value: unknown) {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((entry) => {
    if (!isRecord(entry)) {
      return entry;
    }
    const prepared: AnyRecord = { ...entry };
    if (!Array.isArray(prepared.activities)) {
      const activitySource = findFirstArray([
        prepared.activities,
        prepared.items,
        prepared.schedule,
        prepared.plan,
        prepared.events,
        prepared.activityList,
        prepared.dailyActivities,
      ]);
      if (activitySource) {
        prepared.activities = activitySource;
      }
    }

    if (!Array.isArray(prepared.meals)) {
      const mealsSource = findFirstArray([prepared.meals, prepared.food, prepared.dining]);
      if (mealsSource) {
        prepared.meals = mealsSource;
      }
    }

    return prepared;
  });
}

function findFirstArray(values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function resolveDayTitle(day: AnyRecord, index: number, context?: ItineraryPromptContext) {
  const titleCandidate = normalizeString(
    day.title ?? day.name ?? day.headline ?? day.theme ?? day.label ?? day.titleText ?? day.dayTitle
  );
  if (titleCandidate) {
    return titleCandidate;
  }
  if (typeof day.date === "string") {
    const destination = normalizeString(context?.destination);
    return destination ? `${destination} ${day.date}` : `${day.date} 行程`;
  }
  if (context?.destination) {
    return `${context.destination} 第 ${index + 1} 天`;
  }
  return `第 ${index + 1} 天`;
}

function resolveDaySummary(day: AnyRecord, index: number) {
  const summaryCandidate = normalizeString(
    day.summary ?? day.description ?? day.overview ?? day.notes ?? day.highlight ?? day.focus
  );
  if (summaryCandidate) {
    return summaryCandidate;
  }
  if (Array.isArray(day.activities) && day.activities.length > 0) {
    const summaryFromActivities = buildSummaryFromActivities(
      day.activities as unknown as StructuredTripPlan["days"][number]["activities"]
    );
    if (summaryFromActivities) {
      return summaryFromActivities;
    }
  }
  if (typeof day.date === "string") {
    return `${day.date} 行程安排`;
  }
  return `第 ${index + 1} 天行程安排`;
}

function buildSummaryFromActivities(activities: StructuredTripPlan["days"][number]["activities"]) {
  const names = activities
    .map((activity) => (typeof activity?.name === "string" ? activity.name.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
  if (names.length === 0) {
    return undefined;
  }
  return `重点活动：${names.join(" / ")}`;
}

function deriveBudgetFromPlan(plan?: AnyRecord) {
  if (!plan) {
    return null;
  }
  const total =
    coerceNumber(plan.totalEstimatedCostCNY) ??
    coerceNumber(plan.budgetCNY) ??
    coerceNumber(plan.totalBudget) ??
    coerceNumber(plan.budgetAmount) ??
    (typeof plan.budget === "number" ? coerceNumber(plan.budget) : null);
  const currency = resolveCurrencyFromPlan(plan);
  const candidate: AnyRecord = {};
  if (total !== null) {
    candidate.total = total;
  }
  if (currency) {
    candidate.currency = currency;
  }
  if (plan.flexible !== undefined) {
    candidate.flexible = plan.flexible;
  } else if (plan.budgetFlexible !== undefined) {
    candidate.flexible = plan.budgetFlexible;
  }
  if (plan.budgetBreakdown) {
    candidate.breakdown = plan.budgetBreakdown;
  }
  return Object.keys(candidate).length > 0 ? candidate : null;
}

function prepareBudgetRecord(record: AnyRecord) {
  const prepared: AnyRecord = { ...record };
  const total =
    coerceNumber(
      record.total ??
        record.totalAmount ??
        record.total_amount ??
        record.totalEstimated ??
        record.total_estimated ??
        record.totalBudget ??
        record.total_cost ??
        record.totalCNY ??
        record.totalValue
    ) ?? null;
  if (total !== null) {
    prepared.total = total;
  }

  const currency =
    normalizeString(
      record.currency ?? record.currencyCode ?? record.currencySymbol ?? record.unit ?? record.money
    ) ?? resolveCurrencyFromPlan(record);
  if (currency) {
    prepared.currency = currency;
  }

  const tips = normalizeStringList(record.tips ?? record.note ?? record.notes ?? record.remark);
  if (tips && tips.length > 0) {
    prepared.tips = tips;
  }

  if (!prepared.breakdown) {
    const derivedBreakdown = deriveBudgetBreakdownFromLooseRecord(record);
    if (derivedBreakdown.length > 0) {
      prepared.breakdown = derivedBreakdown;
    }
  }

  return prepared;
}

function deriveBudgetBreakdownFromLooseRecord(record: AnyRecord) {
  const breakdown: AnyRecord[] = [];
  const ignoredKeys = new Set([
    "total",
    "totalAmount",
    "total_amount",
    "totalEstimated",
    "total_estimated",
    "totalBudget",
    "total_cost",
    "totalCNY",
    "totalValue",
    "currency",
    "currencyCode",
    "currencySymbol",
    "unit",
    "money",
    "note",
    "notes",
    "tips",
    "remark",
    "breakdown",
    "flexible",
  ]);

  Object.entries(record).forEach(([key, value]) => {
    if (ignoredKeys.has(key)) {
      return;
    }
    const category = mapBudgetCategoryKey(key);
    if (!category) {
      return;
    }
    if (isRecord(value)) {
      const amount =
        coerceNumber(value.amount ?? value.total ?? value.value ?? value.estimated ?? value.cost) ??
        null;
      if (amount === null) {
        return;
      }
      const description = normalizeString(value.description ?? value.note ?? value.details);
      const entry: AnyRecord = { category, amount };
      if (description) {
        entry.description = description;
      }
      breakdown.push(entry);
      return;
    }
    const amount = coerceNumber(value);
    if (amount === null) {
      return;
    }
    breakdown.push({ category, amount });
  });

  return breakdown;
}

function mapBudgetCategoryKey(key: string) {
  if (!key) {
    return null;
  }
  const normalized = key.trim();
  if (!normalized) {
    return null;
  }
  const lower = normalized.toLowerCase();
  const alias = BUDGET_CATEGORY_ALIASES[lower];
  if (alias) {
    return alias;
  }
  if (
    ["note", "notes", "tip", "tips", "currency", "total", "totalestimated", "totalamount"].includes(
      lower
    )
  ) {
    return null;
  }
  return normalized;
}

const BUDGET_CATEGORY_ALIASES: Record<string, string> = {
  accommodation: "住宿",
  lodging: "住宿",
  hotel: "住宿",
  stay: "住宿",
  dining: "餐饮",
  food: "餐饮",
  meals: "餐饮",
  restaurant: "餐饮",
  transportation: "交通",
  transport: "交通",
  commute: "交通",
  transit: "交通",
  entertainment: "娱乐/门票",
  tickets: "娱乐/门票",
  attractions: "娱乐/门票",
  activities: "娱乐/门票",
  misc: "其他",
  miscellaneous: "其他",
  contingency: "备用",
  shopping: "购物",
};

function resolveCurrencyFromPlan(plan?: AnyRecord) {
  if (!plan) {
    return undefined;
  }
  return (
    normalizeString(plan.currency) ??
    normalizeString(plan.currencyCode) ??
    normalizeString(plan.currencySymbol) ??
    normalizeString(plan.budgetCurrency)
  );
}

function mergeBudgetCandidate(candidate: AnyRecord, plan?: AnyRecord) {
  const merged: AnyRecord = { ...candidate };
  if (!merged.currency) {
    const currencyFromPlan = resolveCurrencyFromPlan(plan);
    if (currencyFromPlan) {
      merged.currency = currencyFromPlan;
    } else if (merged.total !== undefined) {
      merged.currency = "CNY";
    }
  }
  if (
    merged.breakdown === undefined &&
    plan &&
    (Array.isArray(plan.budgetBreakdown) || isRecord(plan.budgetBreakdown))
  ) {
    merged.breakdown = plan.budgetBreakdown;
  }
  return merged;
}

function buildFallbackBreakdown(total: number) {
  const ratios = [
    { category: "住宿", ratio: 0.4 },
    { category: "餐饮", ratio: 0.25 },
    { category: "交通", ratio: 0.2 },
    { category: "娱乐/门票", ratio: 0.15 },
  ];

  return ratios.map(({ category, ratio }) => ({
    category,
    amount: Number((total * ratio).toFixed(2)),
  }));
}

function createPlaceholderActivity(title: string, date?: string) {
  return {
    name: `${title} 行程待完善`,
    type: "activity",
    summary: "模型未返回有效活动，已生成占位条目，请稍后在详情页补充具体安排。",
    startTime: "09:00",
    endTime: "10:00",
    location: date ? `${date} 待定地点` : undefined,
    tips: ["可在行程详情页手动编辑此项活动"],
  };
}

function buildFallbackOverview(context?: ItineraryPromptContext): AnyRecord {
  const startDate = normalizeDateString(context?.startDate) ?? getTodayISODate();
  const endDate =
    normalizeDateString(context?.endDate) ?? normalizeDateString(context?.startDate) ?? startDate;
  const totalDays = deriveDurationDays(startDate, endDate) ?? 1;
  return {
    title: context?.title || `${context?.destination ?? "目的地"}旅行计划`,
    destination: context?.destination ?? "待确认目的地",
    startDate,
    endDate,
    totalDays,
    summary: buildFallbackSummary(context),
    travelStyle: context?.travelStyle,
  };
}

function buildFallbackDays(
  context?: ItineraryPromptContext,
  fallbackStartDate?: string
): StructuredTripPlan["days"] {
  const startDate =
    normalizeDateString(context?.startDate) ?? fallbackStartDate ?? getTodayISODate();
  const endDate = normalizeDateString(context?.endDate) ?? startDate;
  const totalDays = Math.max(deriveDurationDays(startDate, endDate) ?? 1, 1);
  const destination = context?.destination ?? "行程目的地";
  const days: StructuredTripPlan["days"] = [];

  for (let index = 0; index < totalDays; index += 1) {
    const date = deriveNextDate(startDate, index) ?? startDate;
    const title = `${destination} 第 ${index + 1} 天`;
    days.push({
      day: index + 1,
      date,
      title,
      summary: `${destination} 行程占位，请在详情页补充具体安排。`,
      activities: [createPlaceholderActivity(title, date)],
    });
  }

  return days;
}

function buildFallbackSummary(context?: ItineraryPromptContext) {
  if (!context) {
    return "模型未返回行程概要，已生成默认占位文本。";
  }
  const destination = context.destination || "目的地";
  const start = normalizeDateString(context.startDate) ?? "近期";
  const end = normalizeDateString(context.endDate) ?? start;
  const duration = deriveDurationDays(
    normalizeDateString(context.startDate) ?? start,
    normalizeDateString(context.endDate) ?? end
  );
  const travelStyle = context.travelStyle ? `，偏好 ${context.travelStyle}` : "";
  return `${destination} 行程概要（${start} 至 ${end}${
    duration ? `，约 ${duration} 天` : ""
  }${travelStyle}）。`;
}

function resolveBudgetSource(
  value: unknown,
  context?: ItineraryPromptContext,
  plan?: AnyRecord
): AnyRecord | null {
  if (isRecord(value)) {
    return mergeBudgetCandidate(prepareBudgetRecord(value as AnyRecord), plan);
  }

  const amount = coerceNumber(value);
  if (amount !== null) {
    return mergeBudgetCandidate(
      {
        total: amount,
        currency: resolveCurrencyFromPlan(plan) ?? "CNY",
      },
      plan
    );
  }

  const derived = deriveBudgetFromPlan(plan);
  if (derived) {
    return mergeBudgetCandidate(derived, plan);
  }

  if (
    NORMALIZATION_FALLBACKS_ENABLED &&
    typeof context?.budget === "number" &&
    Number.isFinite(context.budget)
  ) {
    return { total: context.budget, currency: "CNY" };
  }

  if (NORMALIZATION_FALLBACKS_ENABLED) {
    return { currency: "CNY", total: 0 };
  }

  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

function resolveFallbackToggle() {
  const raw = process.env.LLM_ENABLE_NORMALIZATION_FALLBACKS;
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
