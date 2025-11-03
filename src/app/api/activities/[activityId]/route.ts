import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiErrorResponse, handleApiError, ok } from "@/lib/api-response";
import { requireAuthContext } from "@/lib/auth-helpers";
import type { Database, Json } from "@/types/database";

type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type ActivityUpdate = Database["public"]["Tables"]["activities"]["Update"];

const paramsSchema = z.object({
  activityId: z.string().uuid(),
});

const updateSchema = z
  .object({
    startTime: z.string().datetime().nullable().optional(),
    endTime: z.string().datetime().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine(
    (value) =>
      !(value.startTime === undefined && value.endTime === undefined && value.note === undefined),
    {
      message: "至少需要提供一项更新字段。",
      path: ["startTime"],
    }
  );

type ActivityRouteContext = { params: Promise<{ activityId: string }> };

export async function PATCH(request: NextRequest, context: ActivityRouteContext) {
  try {
    const params = await context.params;
    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ApiErrorResponse(
        "无效的活动 ID。",
        400,
        "invalid_activity_id",
        parsedParams.error.flatten()
      );
    }

    const body = await request.json();
    const parsedBody = updateSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new ApiErrorResponse("请求体不合法。", 422, "invalid_body", parsedBody.error.flatten());
    }

    const { supabase } = await requireAuthContext();
    const { activityId } = parsedParams.data;
    const { startTime, endTime, note } = parsedBody.data;

    const currentActivity = await fetchActivity(supabase, activityId);

    const updates: ActivityUpdate = {};
    if (startTime !== undefined) {
      updates.start_time = startTime ?? null;
    }
    if (endTime !== undefined) {
      updates.end_time = endTime ?? null;
    }
    if (note !== undefined) {
      const existingDetails = normalizeDetails(currentActivity.details);
      const trimmed = note === null ? null : note.trim();
      if (!trimmed) {
        delete existingDetails.notes;
      } else {
        existingDetails.notes = trimmed;
      }
      updates.details = Object.keys(existingDetails).length > 0 ? (existingDetails as Json) : null;
    }

    const { data: updated, error: updateError } = await supabase
      .from("activities")
      .update(updates)
      .eq("id", activityId)
      .select(
        "id, type, start_time, end_time, location, cost, currency, status, details, created_at, updated_at"
      )
      .single();

    if (updateError) {
      throw new ApiErrorResponse("更新活动失败。", 500, "activity_update_failed", updateError);
    }

    return ok({
      activity: updated,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: ActivityRouteContext) {
  try {
    const params = await context.params;
    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) {
      throw new ApiErrorResponse(
        "无效的活动 ID。",
        400,
        "invalid_activity_id",
        parsedParams.error.flatten()
      );
    }

    const { supabase } = await requireAuthContext();
    const { activityId } = parsedParams.data;

    const { data, error } = await supabase
      .from("activities")
      .delete()
      .eq("id", activityId)
      .select("id")
      .single();

    if (error) {
      throw new ApiErrorResponse("删除活动失败。", 500, "activity_delete_failed", error);
    }

    if (!data) {
      throw new ApiErrorResponse("未找到对应的活动。", 404, "activity_not_found");
    }

    return ok({ id: data.id });
  } catch (error) {
    return handleApiError(error);
  }
}

async function fetchActivity(
  supabase: Awaited<ReturnType<typeof requireAuthContext>>["supabase"],
  activityId: string
) {
  const { data, error } = await supabase
    .from("activities")
    .select("id, start_time, end_time, details")
    .eq("id", activityId)
    .single();

  if (error || !data) {
    throw new ApiErrorResponse("未找到对应的活动。", 404, "activity_not_found", error);
  }

  return data;
}

type ActivityDetails = Record<string, unknown>;

function normalizeDetails(value: ActivityRow["details"]): ActivityDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return { ...(value as ActivityDetails) };
}
