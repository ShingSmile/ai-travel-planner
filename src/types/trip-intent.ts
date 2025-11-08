export type TripIntentSource = "text" | "voice";

export type TripIntentFieldKey = "destination" | "date" | "budget" | "travelers" | "preferences";

export interface TripIntentBudget {
  amount: number;
  currency: string;
  text?: string;
}

export interface TripIntentDateRange {
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  text?: string;
}

export interface TripIntentTravelParty {
  total?: number;
  adults?: number;
  kids?: number;
  hasKids?: boolean;
  description?: string;
}

export interface TripIntentDraft {
  id: string;
  source: TripIntentSource;
  rawInput: string;
  destinations: string[];
  dateRange?: TripIntentDateRange;
  budget?: TripIntentBudget;
  travelParty?: TripIntentTravelParty;
  preferences: string[];
  confidence: number;
  fieldConfidences: Partial<Record<TripIntentFieldKey, number>>;
  transcriptId?: string;
  createdAt: string;
}
