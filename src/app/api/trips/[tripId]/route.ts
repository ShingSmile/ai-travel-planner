import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiErrorResponse, handleApiError, ok } from "@/lib/api-response";
import { requireAuthContext } from "@/lib/auth-helpers";
import type { Database } from "@/types/database";

type TripRow = Database["public"]["Tables"]["trips"]["Row"];
type TripDayRow = Database["public"]["Tables"]["trip_days"]["Row"];
type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];

const paramsSchema = z.object({
  tripId: z.string().uuid(),
});

export async function GET(_request: NextRequest, context: { params: { tripId: string } }) {
  try {
    const parsedParams = paramsSchema.safeParse(context.params);
    if (!parsedParams.success) {
      throw new ApiErrorResponse(
        "无效的行程 ID。",
        400,
        "invalid_trip_id",
        parsedParams.error.flatten()
      );
    }

    const { supabase } = await requireAuthContext();
    const { tripId } = parsedParams.data;

    const { data, error } = await supabase
      .from("trips")
      .select(
        `
          id, title, destination, start_date, end_date, status, budget, budget_breakdown, travelers, tags,
          created_at, updated_at,
          trip_days (
            id, date, summary, notes, created_at, updated_at,
            activities (
              id, type, start_time, end_time, location, cost, currency, status, details, created_at, updated_at
            )
          )
        `
      )
      .eq("id", tripId)
      .maybeSingle();

    if (error) {
      throw new ApiErrorResponse("获取行程详情失败。", 500, "trip_query_failed", error);
    }

    if (!data) {
      throw new ApiErrorResponse("未找到对应的行程。", 404, "trip_not_found");
    }

    const trip = normalizeTripPayload(data);
    return ok({ trip });
  } catch (error) {
    return handleApiError(error);
  }
}

function normalizeTripPayload(
  raw: TripRow & {
    trip_days: ((TripDayRow & { activities: ActivityRow[] | null }) | null)[] | null;
  }
) {
  const days =
    raw.trip_days
      ?.filter((day): day is TripDayRow & { activities: ActivityRow[] | null } => day !== null)
      .map((day) => ({
        id: day.id,
        date: day.date,
        summary: day.summary,
        notes: day.notes,
        createdAt: day.created_at,
        updatedAt: day.updated_at,
        activities: normalizeActivities(day.activities ?? []),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)) ?? [];

  return {
    id: raw.id,
    title: raw.title,
    destination: raw.destination,
    startDate: raw.start_date,
    endDate: raw.end_date,
    status: raw.status ?? "draft",
    budget: raw.budget,
    budgetBreakdown: raw.budget_breakdown,
    travelers: Array.isArray(raw.travelers) ? raw.travelers : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    days,
  };
}

function normalizeActivities(activities: ActivityRow[]) {
  return [...activities]
    .sort((a, b) => compareActivityTime(a.start_time, b.start_time, a.created_at, b.created_at))
    .map((activity) => ({
      id: activity.id,
      type: activity.type,
      startTime: activity.start_time,
      endTime: activity.end_time,
      location: activity.location,
      cost: activity.cost,
      currency: activity.currency,
      status: activity.status ?? "planned",
      details: activity.details,
      createdAt: activity.created_at,
      updatedAt: activity.updated_at,
    }));
}

function compareActivityTime(
  startA: string | null,
  startB: string | null,
  createdAtA: string,
  createdAtB: string
) {
  if (startA && startB) {
    const diff = new Date(startA).getTime() - new Date(startB).getTime();
    if (diff !== 0) return diff;
  } else if (startA && !startB) {
    return -1;
  } else if (!startA && startB) {
    return 1;
  }
  return new Date(createdAtA).getTime() - new Date(createdAtB).getTime();
}
