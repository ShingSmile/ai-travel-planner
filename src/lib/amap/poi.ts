"use server";

import type { Database, Json } from "@/types/database";

type ActivityInsert = Database["public"]["Tables"]["activities"]["Insert"];

type EnrichOptions = {
  city?: string;
  keywords?: string[];
  limit?: number;
};

type AmapPoi = {
  id: string;
  name: string;
  address?: string;
  location?: string;
  tel?: string;
  type?: string;
  photos?: Array<{ url?: string }>;
};

type AmapPoiResponse = {
  status: string;
  info: string;
  count?: string;
  pois?: AmapPoi[];
};

const requestCache = new Map<string, Promise<AmapPoi | null>>();

export async function enrichActivitiesWithPoi(
  activities: ActivityInsert[],
  options: EnrichOptions = {}
) {
  const key = process.env.AMAP_REST_KEY;
  if (!key || activities.length === 0) {
    return;
  }

  const limit = options.limit ?? 8;
  let processed = 0;

  for (const activity of activities) {
    if (processed >= limit) break;
    const keyword = pickKeyword(activity, options.keywords);
    if (!keyword) continue;

    try {
      const poi = await fetchPoi(keyword, { key, city: options.city });
      if (!poi) continue;

      processed += 1;

      applyPoi(activity, poi);
    } catch (error) {
      console.warn("[amap-poi] enrich failed", keyword, error);
    }
  }
}

function pickKeyword(activity: ActivityInsert, fallbackKeywords?: string[]): string | null {
  if (typeof activity.location === "string" && activity.location.trim()) {
    return activity.location.trim();
  }
  const details = toRecord(activity.details);
  const detailName = String(details?.name ?? details?.title ?? "").trim();
  if (detailName) return detailName;
  if (fallbackKeywords && fallbackKeywords.length > 0) {
    const candidate = fallbackKeywords.find((item) => item && item.trim());
    if (candidate) return candidate.trim();
  }
  return null;
}

async function fetchPoi(
  keyword: string,
  params: { key: string; city?: string }
): Promise<AmapPoi | null> {
  const cacheKey = `${keyword}::${params.city ?? ""}`;
  if (requestCache.has(cacheKey)) {
    return requestCache.get(cacheKey)!;
  }

  const promise = internalFetchPoi(keyword, params);
  requestCache.set(cacheKey, promise);
  return promise;
}

async function internalFetchPoi(
  keyword: string,
  params: { key: string; city?: string }
): Promise<AmapPoi | null> {
  try {
    const search = new URLSearchParams({
      key: params.key,
      keywords: keyword,
      page_size: "1",
      output: "JSON",
      show_fields: "photos",
    });
    if (params.city) {
      search.set("city", params.city);
    }

    const response = await fetch(`https://restapi.amap.com/v5/place/text?${search.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`AMap API responded with ${response.status}`);
    }

    const payload = (await response.json()) as AmapPoiResponse;
    if (payload.status !== "1" || !payload.pois || payload.pois.length === 0) {
      return null;
    }
    return payload.pois[0] ?? null;
  } catch (error) {
    console.warn("[amap-poi] fetch failed", keyword, error);
    return null;
  }
}

function applyPoi(activity: ActivityInsert, poi: AmapPoi) {
  const details = { ...toRecord(activity.details) };

  if (poi.photos && poi.photos.length > 0) {
    details.photos = poi.photos
      .map((item) => (item.url && item.url.trim() ? item.url.trim() : null))
      .filter(Boolean);
  }

  details.poi = {
    id: poi.id,
    name: poi.name,
    tel: poi.tel ?? null,
    address: poi.address ?? null,
    type: poi.type ?? null,
  };

  const coords = parseLocation(poi.location);
  if (coords) {
    details.latitude = coords.lat;
    details.longitude = coords.lng;
    details.coordinates = [coords.lng, coords.lat];
  }

  activity.poi_id = poi.id;
  if (!activity.location && poi.name) {
    activity.location = poi.name;
  }
  if (details.summary && !details.address && poi.address) {
    details.address = poi.address;
  }

  activity.details = details as Json;
}

function parseLocation(location?: string | null) {
  if (!location) return null;
  const [lngText, latText] = location.split(",");
  const lng = Number.parseFloat(lngText);
  const lat = Number.parseFloat(latText);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

function toRecord(value: Json | undefined | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}
