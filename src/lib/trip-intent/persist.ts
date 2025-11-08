import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiErrorResponse } from "@/lib/api-response";
import type { Database, Json } from "@/types/database";
import type { TripIntentDraft, TripIntentSource } from "@/types/trip-intent";

interface PersistParams {
  supabase: SupabaseClient<Database>;
  userId: string;
  rawInput: string;
  source: TripIntentSource;
  voiceInputId?: string | null;
  intentDraft: TripIntentDraft;
}

export async function persistTripIntentDraft({
  supabase,
  userId,
  rawInput,
  source,
  voiceInputId,
  intentDraft,
}: PersistParams) {
  const insertPayload: Database["public"]["Tables"]["trip_intents"]["Insert"] = {
    user_id: userId,
    voice_input_id: voiceInputId ?? null,
    raw_input: rawInput,
    structured_payload: intentDraft as unknown as Json,
    field_confidences: intentDraft.fieldConfidences as unknown as Json,
    confidence: intentDraft.confidence.toFixed(4),
    source,
    status: "parsed",
  };

  const { data, error } = await supabase
    .from("trip_intents")
    .insert(insertPayload)
    .select()
    .single();

  if (error || !data) {
    throw new ApiErrorResponse("保存行程意图失败", 500, "trip_intent_insert_failed", error);
  }

  const normalizedIntent: TripIntentDraft = {
    ...intentDraft,
    id: data.id,
    source,
    createdAt: data.created_at,
    transcriptId: intentDraft.transcriptId ?? voiceInputId ?? undefined,
    voiceInputId: voiceInputId ?? intentDraft.voiceInputId,
  };

  return {
    record: data,
    intent: normalizedIntent,
  };
}
