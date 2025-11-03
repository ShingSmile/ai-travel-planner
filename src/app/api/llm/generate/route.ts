import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiErrorResponse, handleApiError, ok } from "@/lib/api-response";
import { requireAuthContext } from "@/lib/auth-helpers";
import { BailianClient } from "@/lib/llm";
import { LLMGenerationError } from "@/lib/llm/errors";
import type { ItineraryPromptContext, StructuredTripPlan } from "@/lib/llm/types";
import { enrichActivitiesWithPoi } from "@/lib/amap/poi";
import type { Database } from "@/types/database";
import { consumeRateLimit, resolveRateLimitNumber } from "@/lib/rate-limit";

const requestSchema = z.object({
  tripId: z.string().uuid(),
  forceRegenerate: z.boolean().optional(),
});

type TripRow = Database["public"]["Tables"]["trips"]["Row"];
type TripDayInsert = Database["public"]["Tables"]["trip_days"]["Insert"];
type ActivityInsert = Database["public"]["Tables"]["activities"]["Insert"];
type SupabaseClientType = Awaited<ReturnType<typeof requireAuthContext>>["supabase"];
const LLM_RATE_LIMIT_WINDOW_MS = resolveRateLimitNumber(
  process.env.LLM_RATE_LIMIT_WINDOW_MS,
  60_000
);
const LLM_RATE_LIMIT_MAX = resolveRateLimitNumber(process.env.LLM_RATE_LIMIT_MAX, 3);

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireAuthContext();
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiErrorResponse("请求数据不合法。", 422, "invalid_body", parsed.error.flatten());
    }

    const { tripId, forceRegenerate } = parsed.data;
    const rateLimitResult = consumeRateLimit({
      bucket: "llm_generate",
      identifier: user.id,
      windowMs: LLM_RATE_LIMIT_WINDOW_MS,
      limit: LLM_RATE_LIMIT_MAX,
    });

    if (!rateLimitResult.allowed) {
      throw new ApiErrorResponse(
        "生成请求过于频繁，请稍后再试。",
        429,
        "llm_rate_limited",
        {
          retryAfter: rateLimitResult.retryAfter,
        },
        { headers: rateLimitResult.headers }
      );
    }

    const trip = await fetchTrip(supabase, tripId);
    const previousStatus = trip.status ?? "draft";
    if (trip.status === "generating") {
      throw new ApiErrorResponse("行程正在生成中，请稍后再试。", 409, "trip_generating");
    }

    if (trip.status === "ready" && !forceRegenerate) {
      throw new ApiErrorResponse(
        "行程已生成，如需重新生成请设置 forceRegenerate。",
        409,
        "trip_ready"
      );
    }

    await updateTripStatus(supabase, tripId, "generating");

    let generationSucceeded = false;
    try {
      const promptContext = buildPromptContext(trip);
      const client = new BailianClient();
      const result = await client.generateTripPlan(promptContext);

      await persistGenerationResult(supabase, tripId, result.output);
      const totalBudget = normalizeNumeric(result.output.budget?.total);
      await updateTripStatus(supabase, tripId, "ready", {
        budget_breakdown: result.output.budget,
        ...(totalBudget !== null ? { budget: totalBudget } : {}),
      });

      generationSucceeded = true;
      return ok(
        {
          tripId,
          plan: result.output,
          usage: result.usage ?? null,
          attempts: result.attempts,
        },
        { headers: rateLimitResult.headers }
      );
    } finally {
      if (!generationSucceeded) {
        await updateTripStatus(supabase, tripId, previousStatus);
      }
    }
  } catch (error) {
    if (error instanceof LLMGenerationError) {
      return handleApiError(
        new ApiErrorResponse(error.message, 502, `llm_${error.kind ?? "unknown"}`, {
          attempt: error.attempt,
          details: error.details,
        })
      );
    }
    return handleApiError(error);
  }
}

async function fetchTrip(supabase: SupabaseClientType, tripId: string) {
  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, title, destination, start_date, end_date, budget, travelers, tags, llm_request, status"
    )
    .eq("id", tripId)
    .single();

  if (error || !data) {
    throw new ApiErrorResponse("未找到对应的行程草稿。", 404, "trip_not_found", error);
  }

  return data;
}

async function updateTripStatus(
  supabase: SupabaseClientType,
  tripId: string,
  status: string,
  extra?: Partial<Database["public"]["Tables"]["trips"]["Update"]>
) {
  const { error } = await supabase
    .from("trips")
    .update({
      status,
      ...(extra ?? {}),
    })
    .eq("id", tripId);

  if (error) {
    throw new ApiErrorResponse(
      "更新行程状态失败，请稍后重试。",
      500,
      "trip_status_update_failed",
      error
    );
  }
}

function buildPromptContext(trip: TripRow): ItineraryPromptContext {
  const rawRequest = (trip.llm_request ?? {}) as Record<string, unknown>;
  const travelersRaw = Array.isArray(trip.travelers) ? trip.travelers : [];

  return {
    title: trip.title,
    destination: trip.destination,
    startDate: trip.start_date,
    endDate: trip.end_date,
    budget: trip.budget ? Number.parseFloat(trip.budget) : undefined,
    tags: Array.isArray(trip.tags)
      ? trip.tags.filter((item): item is string => typeof item === "string")
      : undefined,
    notes: typeof rawRequest.notes === "string" ? rawRequest.notes : undefined,
    travelStyle: typeof rawRequest.travelStyle === "string" ? rawRequest.travelStyle : undefined,
    travelers: travelersRaw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const traveler = item as Record<string, unknown>;
        const name = typeof traveler.name === "string" ? traveler.name : undefined;
        const role = typeof traveler.role === "string" ? traveler.role : undefined;
        const age = typeof traveler.age === "number" ? traveler.age : undefined;
        if (!name && !role && typeof age !== "number") {
          return null;
        }
        return {
          name,
          role,
          age,
        };
      })
      .filter((item): item is NonNullable<ItineraryPromptContext["travelers"]>[number] => !!item),
  };
}

async function persistGenerationResult(
  supabase: SupabaseClientType,
  tripId: string,
  plan: StructuredTripPlan
) {
  const { error: deleteDaysError } = await supabase
    .from("trip_days")
    .delete()
    .eq("trip_id", tripId);
  if (deleteDaysError) {
    throw new ApiErrorResponse(
      "清理旧行程数据失败。",
      500,
      "trip_days_cleanup_failed",
      deleteDaysError
    );
  }

  const dayInserts: TripDayInsert[] = plan.days.map((day) => ({
    trip_id: tripId,
    date: day.date,
    summary: day.summary,
    notes: day.notes ? day.notes.join("\n") : null,
  }));

  const { data: insertedDays, error: insertDaysError } = await supabase
    .from("trip_days")
    .insert(dayInserts)
    .select("id, date");

  if (insertDaysError || !insertedDays) {
    throw new ApiErrorResponse(
      "写入每日行程失败。",
      500,
      "trip_days_insert_failed",
      insertDaysError
    );
  }

  const dayIdByDate = new Map(insertedDays.map((day) => [day.date, day.id]));

  const activityPayload: ActivityInsert[] = [];

  for (const dayPlan of plan.days) {
    const tripDayId = dayIdByDate.get(dayPlan.date);
    if (!tripDayId) continue;

    for (const activity of dayPlan.activities) {
      activityPayload.push(buildActivityInsert(tripDayId, dayPlan.date, activity, "activity"));
    }

    if (dayPlan.meals) {
      for (const meal of dayPlan.meals) {
        activityPayload.push(buildActivityInsert(tripDayId, dayPlan.date, meal, "meal"));
      }
    }

    if (dayPlan.accommodations) {
      activityPayload.push(
        buildAccommodationInsert(
          tripDayId,
          dayPlan.date,
          dayPlan.accommodations,
          plan.overview.destination
        )
      );
    }
  }

  if (activityPayload.length > 0) {
    await enrichActivitiesWithPoi(activityPayload, {
      city: plan.overview.destination,
      keywords: [plan.overview.destination, plan.overview.title],
      limit: 12,
    });

    const { error: insertActivityError } = await supabase
      .from("activities")
      .insert(activityPayload);
    if (insertActivityError) {
      throw new ApiErrorResponse(
        "写入行程活动失败。",
        500,
        "activities_insert_failed",
        insertActivityError
      );
    }
  }
}

function buildActivityInsert(
  tripDayId: string,
  date: string,
  activity: StructuredTripPlan["days"][number]["activities"][number],
  fallbackType: string
): ActivityInsert {
  const type = activity.type || fallbackType;
  return {
    trip_day_id: tripDayId,
    type,
    start_time: combineDateTime(date, activity.startTime),
    end_time: combineDateTime(date, activity.endTime),
    location: activity.location ?? null,
    details: {
      name: activity.name,
      summary: activity.summary ?? null,
      tips: activity.tips ?? [],
      budget: activity.budget ?? null,
      sourceType: type,
    },
    cost: normalizeNumeric(activity.budget?.amount),
    currency: activity.budget?.currency ?? null,
  };
}

function buildAccommodationInsert(
  tripDayId: string,
  date: string,
  accommodation: NonNullable<StructuredTripPlan["days"][number]["accommodations"]>,
  destination: string
): ActivityInsert {
  return {
    trip_day_id: tripDayId,
    type: "accommodation",
    start_time: combineDateTime(date, accommodation.checkInTime),
    end_time: combineDateTime(date, accommodation.checkOutTime),
    location: accommodation.address ?? destination ?? null,
    details: {
      name: accommodation.name,
      summary: `入住 ${accommodation.name}`,
      budget: accommodation.budget ?? null,
    },
    cost: normalizeNumeric(accommodation.budget?.amount),
    currency: accommodation.budget?.currency ?? null,
  };
}

function combineDateTime(date: string, time?: string | null) {
  if (!time) return null;
  const isoString = `${date}T${time}:00`;
  return new Date(isoString).toISOString();
}

function normalizeNumeric(value: number | undefined | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return value.toFixed(2);
}
