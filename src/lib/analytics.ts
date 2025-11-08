"use client";

import type { TripIntentFieldKey, TripIntentSource } from "@/types/trip-intent";

export interface TripIntentAnalyticsEvent {
  source: TripIntentSource;
  success: boolean;
  durationMs: number;
  missingFields: TripIntentFieldKey[];
  confidence?: number;
  timestamp?: number;
  errorMessage?: string;
}

declare global {
  interface Window {
    __TRIP_INTENT_EVENTS__?: TripIntentAnalyticsEvent[];
  }
}

const isProd = process.env.NODE_ENV === "production";
const analyticsEndpoint = process.env.NEXT_PUBLIC_TRIP_INTENT_ANALYTICS_ENDPOINT;

export function trackTripIntentEvent(event: TripIntentAnalyticsEvent) {
  const payload: TripIntentAnalyticsEvent = {
    ...event,
    timestamp: event.timestamp ?? Date.now(),
  };

  if (typeof window === "undefined") {
    if (!isProd) {
      console.info("[trip-intent] analytics", payload);
    }
    return;
  }

  window.__TRIP_INTENT_EVENTS__ = window.__TRIP_INTENT_EVENTS__ ?? [];
  window.__TRIP_INTENT_EVENTS__!.push(payload);

  if (analyticsEndpoint && typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon(analyticsEndpoint, blob);
  } else if (!isProd) {
    console.debug("[trip-intent] analytics", payload);
  }
}

export function collectMissingFields(intent: {
  destinations: string[];
  dateRange?: { startDate?: string; endDate?: string; durationDays?: number | null };
  budget?: { amount?: number | null };
  travelParty?: { total?: number | null };
  preferences: string[];
}): TripIntentFieldKey[] {
  const missing: TripIntentFieldKey[] = [];
  if (!intent.destinations.length) {
    missing.push("destination");
  }
  if (
    !intent.dateRange?.startDate &&
    !intent.dateRange?.endDate &&
    !intent.dateRange?.durationDays
  ) {
    missing.push("date");
  }
  if (!intent.budget?.amount) {
    missing.push("budget");
  }
  if (!intent.travelParty?.total) {
    missing.push("travelers");
  }
  if (!intent.preferences.length) {
    missing.push("preferences");
  }
  return missing;
}
