export type LLMMessageRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
}

export interface LLMGenerationUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  requestId?: string;
}

export interface TravelerPreference {
  name?: string;
  role?: string;
  age?: number;
}

export interface ItineraryPromptContext {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget?: number;
  travelStyle?: string;
  notes?: string;
  tags?: string[];
  travelers?: TravelerPreference[];
}

export interface ActivityBudget {
  amount: number;
  currency: string;
  description?: string;
}

export interface TripActivity {
  name: string;
  type: string;
  summary?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  tips?: string[];
  budget?: ActivityBudget;
}

export interface DailyAccommodation {
  name: string;
  address?: string;
  checkInTime?: string;
  checkOutTime?: string;
  budget?: ActivityBudget;
}

export interface DailyPlan {
  day: number;
  date: string;
  title: string;
  summary: string;
  activities: TripActivity[];
  accommodations?: DailyAccommodation | null;
  meals?: TripActivity[];
  notes?: string[];
}

export interface BudgetBreakdownItem {
  category: string;
  amount: number;
  description?: string;
  percentage?: number;
}

export interface TripBudget {
  currency: string;
  total: number;
  breakdown: BudgetBreakdownItem[];
  tips?: string[];
}

export interface StructuredTripPlan {
  overview: {
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    summary: string;
    travelStyle?: string;
  };
  days: DailyPlan[];
  budget: TripBudget;
  suggestions?: string[];
}

export interface LLMStructuredGenerationResult<T> {
  output: T;
  raw: unknown;
  attempts: number;
  usage?: LLMGenerationUsage;
}
