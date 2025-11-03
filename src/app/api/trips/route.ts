import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handleApiError, ApiErrorResponse } from "@/lib/api-response";
import { requireAuthContext } from "@/lib/auth-helpers";
import type { Database, Json } from "@/types/database";

const listQuerySchema = z.object({
  limit: z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().min(1).max(50))
    .optional(),
  status: z.enum(["draft", "generating", "ready", "archived"]).optional(),
});

const travelerSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  age: z.number().int().min(0).optional(),
});

const createTripSchema = z
  .object({
    title: z.string().min(1, "行程标题不能为空").max(100),
    destination: z.string().min(1, "目的地不能为空").max(100),
    startDate: z.string().min(1, "开始日期不能为空"),
    endDate: z.string().min(1, "结束日期不能为空"),
    budget: z.number().nonnegative().optional(),
    travelers: z.array(travelerSchema).optional(),
    tags: z.array(z.string().min(1)).optional(),
    llmRequest: z.record(z.string(), z.unknown()).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
    message: "开始日期不能晚于结束日期",
    path: ["endDate"],
  });

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireAuthContext();
    const parsedQuery = listQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));

    if (!parsedQuery.success) {
      throw new ApiErrorResponse(
        "查询参数不合法",
        422,
        "invalid_query",
        parsedQuery.error.flatten()
      );
    }

    const { limit, status } = parsedQuery.data;

    let query = supabase
      .from("trips")
      .select(
        "id, title, destination, start_date, end_date, status, budget, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      throw new ApiErrorResponse("获取行程列表失败", 500, "db_query_error", error);
    }

    return ok({ trips: data ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireAuthContext();
    const body = await request.json();
    const parsedBody = createTripSchema.safeParse(body);

    if (!parsedBody.success) {
      throw new ApiErrorResponse("请求体不合法", 422, "invalid_body", parsedBody.error.flatten());
    }

    const payload = parsedBody.data;

    const normalizedBudget = typeof payload.budget === "number" ? payload.budget.toFixed(2) : null;

    const travelerRecords =
      payload.travelers
        ?.map((traveler) => {
          const normalized: Record<string, Json | undefined> = {};
          if (traveler.name) {
            normalized.name = traveler.name;
          }
          if (traveler.role) {
            normalized.role = traveler.role;
          }
          if (typeof traveler.age === "number") {
            normalized.age = traveler.age;
          }
          return normalized;
        })
        .filter((traveler) => Object.keys(traveler).length > 0) ?? [];

    const normalizedTravelers: Json | null = travelerRecords.length > 0 ? travelerRecords : null;

    const normalizedTags = payload.tags && payload.tags.length > 0 ? payload.tags : null;

    const normalizedLlmRequest: Json | null =
      payload.llmRequest && Object.keys(payload.llmRequest).length > 0
        ? (payload.llmRequest as Json)
        : null;

    const insertPayload: Database["public"]["Tables"]["trips"]["Insert"] = {
      user_id: user.id,
      title: payload.title,
      destination: payload.destination,
      start_date: payload.startDate,
      end_date: payload.endDate,
      budget: normalizedBudget,
      travelers: normalizedTravelers,
      tags: normalizedTags,
      llm_request: normalizedLlmRequest,
      status: "draft" as const,
    };

    const { data, error } = await supabase.from("trips").insert(insertPayload).select().single();

    if (error) {
      throw new ApiErrorResponse("创建行程失败", 500, "db_insert_error", error);
    }

    return ok({ trip: data }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
