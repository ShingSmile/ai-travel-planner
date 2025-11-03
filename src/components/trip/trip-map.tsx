"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "@amap/amap-jsapi-types";
import AMapLoader from "@amap/amap-jsapi-loader";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type TripMapDay = {
  id: string;
  date: string;
  summary: string | null;
  activities: TripMapActivity[];
};

type TripMapActivity = {
  id: string;
  type: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  details: Record<string, unknown> | null;
};

type TripMapProps = {
  days: TripMapDay[];
  selectedActivityId: string | null;
  onActivitySelect?: (activityId: string | null) => void;
};

type MapOverlay = {
  marker: AMap.Marker;
  activityId: string;
  orderLabel: string;
};

type MapSegment = {
  polyline: AMap.Polyline;
  dayId: string;
};

type Coordinates = {
  lng: number;
  lat: number;
};

type AMapNamespace = typeof globalThis extends { AMap: infer T } ? T : never;
type GeocoderStatus = "complete" | "no_data" | "error";
type GeocodeResult = {
  geocodes: Array<{
    location?: {
      getLng(): number;
      getLat(): number;
    };
  }>;
};
type AMapGeocoder = {
  getLocation: (
    address: string,
    callback: (status: GeocoderStatus, result: GeocodeResult) => void
  ) => void;
};

const loaderOptions = {
  key: process.env.NEXT_PUBLIC_AMAP_KEY ?? "",
  version: "2.0",
  plugins: ["AMap.Geocoder"],
};

const activityTypeColor: Record<string, string> = {
  transport: "#2563eb",
  attraction: "#16a34a",
  dining: "#f97316",
  hotel: "#7c3aed",
  shopping: "#be123c",
  accommodation: "#7c3aed",
};

export function TripMap({ days, selectedActivityId, onActivitySelect }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const overlaysRef = useRef<{ markers: MapOverlay[]; segments: MapSegment[] }>({
    markers: [],
    segments: [],
  });
  const geocoderRef = useRef<AMapGeocoder | null>(null);
  const geocodeCacheRef = useRef<Map<string, Coordinates>>(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const flattenedActivities = useMemo(() => {
    return days.flatMap((day, dayIndex) => {
      const sorted = [...day.activities].sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : Number.POSITIVE_INFINITY;
        const timeB = b.startTime ? new Date(b.startTime).getTime() : Number.POSITIVE_INFINITY;
        return timeA - timeB;
      });
      return sorted.map((activity, index) => ({
        activity,
        day,
        orderLabel: `D${dayIndex + 1}-${index + 1}`,
      }));
    });
  }, [days]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!loaderOptions.key) {
      setError("缺少高德地图应用 Key，请在环境变量中配置 NEXT_PUBLIC_AMAP_KEY。");
      setLoading(false);
      return;
    }

    let destroyed = false;

    setLoading(true);
    setError(null);

    AMapLoader.load(loaderOptions)
      .then((amap) => {
        if (destroyed) return;

        amapRef.current = amap;

        const map = new amap.Map(containerRef.current as HTMLDivElement, {
          zoom: 12,
          viewMode: "3D",
          resizeEnable: true,
        });
        mapRef.current = map;

        geocoderRef.current = new amap.Geocoder({
          city: "全国",
        }) as AMapGeocoder;

        setLoading(false);
      })
      .catch((reason) => {
        console.error("[TripMap] 初始化高德地图失败", reason);
        if (destroyed) return;
        setError("加载高德地图失败，请稍后重试。");
        setLoading(false);
      });

    return () => {
      destroyed = true;
      overlaysRef.current.markers.forEach(({ marker }) => marker.setMap(null));
      overlaysRef.current.segments.forEach(({ polyline }) => polyline.setMap(null));
      overlaysRef.current = { markers: [], segments: [] };
      geocoderRef.current = null;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
      amapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !amapRef.current) return;

    overlaysRef.current.markers.forEach(({ marker }) => marker.setMap(null));
    overlaysRef.current.segments.forEach(({ polyline }) => polyline.setMap(null));
    overlaysRef.current = { markers: [], segments: [] };

    let disposed = false;

    const drawOverlays = async () => {
      const amap = amapRef.current;
      if (!amap) return;

      const tasks = flattenedActivities.filter((entry) => {
        return Boolean(entry.activity.location || extractCoordinates(entry.activity));
      });

      const resolved = await Promise.all(
        tasks.map(async (entry) => {
          const coords = await resolveCoordinates(entry.activity, geocodeCacheRef.current);
          if (coords) {
            return { ...entry, coords };
          }
          return null;
        })
      );

      const validEntries = resolved.filter(Boolean) as Array<
        (typeof tasks)[number] & { coords: Coordinates }
      >;

      if (disposed || validEntries.length === 0) {
        if (validEntries.length === 0) {
          setError("当前行程缺少位置信息，无法展示地图点位。");
        }
        return;
      }

      setError(null);

      const markers: MapOverlay[] = validEntries.map(({ activity, day, coords, orderLabel }) => {
        const marker = new amap.Marker({
          position: new amap.LngLat(coords.lng, coords.lat),
          title: `${orderLabel} ${getActivityName(activity)}`,
          offset: new amap.Pixel(-10, -28),
          icon: createMarkerIcon(amap, activity.type),
          extData: {
            activityId: activity.id,
          },
        });

        marker.setLabel({
          direction: "top",
          offset: new amap.Pixel(0, -8),
          style: {
            border: "none",
            background: "transparent",
            color: "#111827",
            fontWeight: "600",
          },
          content: orderLabel,
        } as Parameters<AMap.Marker["setLabel"]>[0]);

        marker.on("click", () => {
          onActivitySelect?.(activity.id);
        });

        return {
          marker,
          activityId: activity.id,
          orderLabel: `${day.summary ?? day.date} · ${orderLabel}`,
        };
      });

      markers.forEach(({ marker }) => marker.setMap(mapRef.current!));
      overlaysRef.current.markers = markers;

      const dayGroups = groupEntriesByDay(validEntries);
      const segments: MapSegment[] = [];

      dayGroups.forEach(({ dayId, entries }) => {
        if (entries.length < 2) return;
        const path = entries.map((entry) => [entry.coords.lng, entry.coords.lat]) as [
          number,
          number,
        ][];
        const polyline = new amap.Polyline({
          path,
          strokeColor: "#2563eb",
          strokeOpacity: 0.6,
          strokeWeight: 4,
          strokeStyle: "solid",
          lineJoin: "round",
          zIndex: 40,
        });
        polyline.setMap(mapRef.current!);
        segments.push({ polyline, dayId });
      });

      overlaysRef.current.segments = segments;
      mapRef.current!.setFitView(undefined, undefined, [80, 80, 80, 80]);
    };

    drawOverlays().catch((reason) => {
      console.error("[TripMap] 绘制地图覆盖物失败", reason);
      if (!disposed) {
        setError("绘制地图覆盖物失败，请刷新页面后重试。");
      }
    });

    return () => {
      disposed = true;
    };
  }, [flattenedActivities, onActivitySelect]);

  useEffect(() => {
    if (!mapRef.current || !amapRef.current) return;
    if (!selectedActivityId) {
      return;
    }

    const overlay = overlaysRef.current.markers.find(
      (item) => item.activityId === selectedActivityId
    );
    if (!overlay) return;

    const amap = amapRef.current;
    const infoWindow = new amap.InfoWindow({
      offset: new amap.Pixel(0, -30),
      closeWhenClickMap: true,
    });
    infoWindow.setContent(
      `<div class="trip-map-infowindow"><strong>${overlay.orderLabel}</strong></div>`
    );
    const markerPosition = overlay.marker.getPosition();
    if (!markerPosition) {
      return;
    }
    const markerCenter: [number, number] = [markerPosition.getLng(), markerPosition.getLat()];
    infoWindow.open(mapRef.current, markerCenter);
    mapRef.current.setCenter(markerCenter);
  }, [selectedActivityId]);

  if (loading) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-3xl border border-border bg-surface shadow-card">
        <Spinner />
        <span className="ml-3 text-sm text-muted">正在加载地图...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={cn(
          "h-80 w-full overflow-hidden rounded-3xl border border-border bg-muted/20 shadow-card",
          error && "grid place-items-center bg-background text-sm text-muted"
        )}
      >
        {error && <span>{error}</span>}
      </div>
      <p className="text-xs text-muted">
        温馨提示：地图点位基于当前行程位置推算，如出现偏差可在下一任务中完善 POI 数据。
      </p>
    </div>
  );

  async function resolveCoordinates(
    activity: TripMapActivity,
    cache: Map<string, Coordinates>
  ): Promise<Coordinates | null> {
    const fromDetails = extractCoordinates(activity);
    if (fromDetails) return fromDetails;

    const location = activity.location;
    if (!location) return null;

    if (cache.has(location)) {
      return cache.get(location)!;
    }

    const geocoder = geocoderRef.current;
    const amap = amapRef.current;
    if (!geocoder || !amap) return null;

    try {
      const coords = await new Promise<Coordinates | null>((resolve) => {
        geocoder.getLocation(location, (status, result) => {
          if (status === "complete" && result && result.geocodes.length > 0) {
            const { location: point } = result.geocodes[0];
            if (point) {
              resolve({ lng: point.getLng(), lat: point.getLat() });
              return;
            }
          }
          resolve(null);
        });
      });

      if (coords) {
        cache.set(location, coords);
      }
      return coords;
    } catch (reason) {
      console.warn("[TripMap] 获取地理编码失败", reason);
      return null;
    }
  }
}

function extractCoordinates(activity: TripMapActivity): Coordinates | null {
  const details = activity.details;
  if (!details || typeof details !== "object") return null;
  const source = details as Record<string, unknown>;

  const lat = pickNumber(source, ["latitude", "lat", "latituide", "geoLat"]);
  const lng = pickNumber(source, ["longitude", "lng", "longtitude", "geoLng"]);

  if (typeof lat === "number" && typeof lng === "number") {
    return { lat, lng };
  }

  const coordinates = source.coordinates;
  if (Array.isArray(coordinates) && coordinates.length === 2) {
    const [possibleLng, possibleLat] = coordinates;
    if (
      typeof possibleLng === "number" &&
      typeof possibleLat === "number" &&
      Math.abs(possibleLat) <= 90 &&
      Math.abs(possibleLng) <= 180
    ) {
      return { lat: possibleLat, lng: possibleLng };
    }
  }

  return null;
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function groupEntriesByDay<
  T extends { day: TripMapDay; coords: Coordinates; activity: TripMapActivity },
>(entries: T[]) {
  const map = new Map<string, T[]>();
  entries.forEach((entry) => {
    const list = map.get(entry.day.id);
    if (list) {
      list.push(entry);
    } else {
      map.set(entry.day.id, [entry]);
    }
  });

  return Array.from(map.entries()).map(([dayId, items]) => ({
    dayId,
    entries: items,
  }));
}

function createMarkerIcon(amap: AMapNamespace, type: string) {
  const color = activityTypeColor[type] ?? "#0f172a";
  const svg = `
    <svg width="28" height="32" viewBox="0 0 28 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 31C14 31 26 21.9711 26 12.8571C26 5.94752 20.1797 1 14 1C7.8203 1 2 5.94752 2 12.8571C2 21.9711 14 31 14 31Z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="12" r="5" fill="white"/>
    </svg>`;
  return new amap.Icon({
    image: `data:image/svg+xml;base64,${window.btoa(svg)}`,
    size: new amap.Size(28, 32),
    imageSize: new amap.Size(28, 32),
  });
}

function getActivityName(activity: TripMapActivity) {
  const details = activity.details;
  if (details && typeof details === "object") {
    const name = (details as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) {
      return name;
    }
  }
  if (activity.location) return activity.location;
  return "行程活动";
}
