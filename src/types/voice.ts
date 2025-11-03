export type VoiceIntent = "trip_notes" | "expense" | "unknown";

export interface VoiceUploadResponse {
  voiceInputId: string;
  transcript: string;
  intent: VoiceIntent;
  expenseDraft?: {
    category?: string;
    amount?: number;
    currency?: string;
    memo?: string;
    source?: string;
  };
}

export interface VoiceRecorderMeta {
  purpose: "trip_notes" | "expense";
  tripId?: string;
}
