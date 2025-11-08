import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, handleApiError, ApiErrorResponse } from "@/lib/api-response";
import { requireAuthContext } from "@/lib/auth-helpers";
import { parseTripIntent } from "@/lib/trip-intent/parser";
import { persistTripIntentDraft } from "@/lib/trip-intent/persist";
import type { TripIntentSource } from "@/types/trip-intent";

const createIntentSchema = z.object({
  rawInput: z.string().trim().min(4, "描述太短，无法解析").max(800, "描述内容过长"),
  source: z.enum(["text", "voice"]).default("text"),
  voiceInputId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireAuthContext();
    const body = await request.json();
    const parsedBody = createIntentSchema.safeParse(body);

    if (!parsedBody.success) {
      throw new ApiErrorResponse("请求参数不合法", 422, "invalid_body", parsedBody.error.flatten());
    }

    const { rawInput, source, voiceInputId } = parsedBody.data;

    if (voiceInputId) {
      const { data: voiceRecord, error: voiceError } = await supabase
        .from("voice_inputs")
        .select("id")
        .eq("id", voiceInputId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (voiceError) {
        throw new ApiErrorResponse(
          "查询语音记录失败",
          500,
          "voice_input_lookup_failed",
          voiceError
        );
      }

      if (!voiceRecord) {
        throw new ApiErrorResponse("未找到对应的语音记录", 404, "voice_input_not_found");
      }
    }

    const intentDraft = parseTripIntent(rawInput, {
      source: source as TripIntentSource,
      voiceInputId,
      transcriptId: voiceInputId ?? undefined,
    });

    const { intent } = await persistTripIntentDraft({
      supabase,
      userId: user.id,
      rawInput,
      source: source as TripIntentSource,
      voiceInputId,
      intentDraft,
    });

    return ok({ intent }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
