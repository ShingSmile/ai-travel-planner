"use server";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiErrorResponse, handleApiError, ok } from "@/lib/api-response";
import { requireAuthContext } from "@/lib/auth-helpers";
import type { Database } from "@/types/database";

type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
type ExpenseInsert = Database["public"]["Tables"]["expenses"]["Insert"];

const searchSchema = z.object({
  tripId: z.string().uuid(),
});

const createSchema = z.object({
  tripId: z.string().uuid(),
  category: z.string().min(1).max(50),
  amount: z.number().positive(),
  currency: z.string().trim().min(1).max(10).optional(),
  source: z.string().trim().max(50).optional(),
  memo: z.string().trim().max(200).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const params = searchSchema.safeParse({
      tripId: request.nextUrl.searchParams.get("tripId"),
    });

    if (!params.success) {
      throw new ApiErrorResponse(
        "缺少有效的行程 ID。",
        400,
        "invalid_trip_id",
        params.error.flatten()
      );
    }

    const { tripId } = params.data;
    const { supabase } = await requireAuthContext();

    const { data, error } = await supabase
      .from("expenses")
      .select("id, trip_id, category, amount, currency, source, memo, created_at, updated_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new ApiErrorResponse("获取费用记录失败。", 500, "expenses_query_failed", error);
    }

    const { expenses, summary } = buildExpensePayload(data ?? []);
    return ok({
      expenses,
      summary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiErrorResponse(
        "费用数据不合法，请检查后重试。",
        422,
        "invalid_expense_payload",
        parsed.error.flatten()
      );
    }

    const { supabase } = await requireAuthContext();
    const payload = buildInsertPayload(parsed.data);

    const { data, error } = await supabase
      .from("expenses")
      .insert(payload)
      .select("id, trip_id, category, amount, currency, source, memo, created_at, updated_at")
      .single();

    if (error || !data) {
      throw new ApiErrorResponse("新增费用失败，请稍后重试。", 500, "expense_insert_failed", error);
    }

    return ok({
      expense: normalizeExpenseRow(data),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function buildInsertPayload(input: z.infer<typeof createSchema>): ExpenseInsert {
  return {
    trip_id: input.tripId,
    category: input.category,
    amount: input.amount.toFixed(2),
    currency: input.currency ?? "CNY",
    source: input.source?.trim() || null,
    memo: input.memo?.trim() || null,
  };
}

function buildExpensePayload(rows: ExpenseRow[]) {
  const expenses = rows.map((row) => normalizeExpenseRow(row));

  const currency = expenses.find((item) => item.currency.trim().length > 0)?.currency ?? "CNY";
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);

  const byCategory = new Map<string, number>();
  expenses.forEach((item) => {
    const current = byCategory.get(item.category) ?? 0;
    byCategory.set(item.category, current + item.amount);
  });

  const categories = Array.from(byCategory.entries())
    .map(([category, amount]) => ({
      category,
      total: amount,
      percentage: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    expenses,
    summary: {
      currency,
      total,
      categories,
    },
  };
}

function normalizeExpenseRow(row: ExpenseRow) {
  return {
    id: row.id,
    tripId: row.trip_id,
    category: row.category,
    amount: parseAmount(row.amount),
    currency: row.currency ?? "CNY",
    source: row.source,
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseAmount(amount: string | null) {
  if (!amount) return 0;
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? parsed : 0;
}
