"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@amap/amap-jsapi-types";
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
  cityHint?: string | null;
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

const activityTypeLabel: Record<string, string> = {
  transport: "交通",
  attraction: "景点/活动",
  dining: "餐饮",
  hotel: "酒店",
  shopping: "购物",
  accommodation: "住宿",
};

export function TripMap({ days, selectedActivityId, onActivitySelect, cityHint }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMap.Map | null>(null);
  const amapRef = useRef<AMapNamespace | null>(null);
  const overlaysRef = useRef<{ markers: MapOverlay[]; segments: MapSegment[] }>({
    markers: [],
    segments: [],
  });
  const visibleMarkerIdsRef = useRef<Set<string>>(new Set());
  const geocoderRef = useRef<AMapGeocoder | null>(null);
  const geocodeCacheRef = useRef<Map<string, Coordinates>>(new Map());
  const routeCacheRef = useRef<Map<string, Coordinates[]>>(new Map());
  const geocodeFailureRef = useRef<Set<string>>(new Set());
  const geocodePendingRef = useRef<Set<string>>(new Set());
  const missingActivityLogRef = useRef<Set<string>>(new Set());
  const lastSelectedIdRef = useRef<string | null>(null);
  const lastVisibleDayRef = useRef<string | "all">("all");
  const pendingFocusIdRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleDayId, setVisibleDayId] = useState<string | "all">("all");
  const [overlayRevision, setOverlayRevision] = useState(0);
  const [selectedMarkerStatus, setSelectedMarkerStatus] = useState<
    "unknown" | "available" | "missing"
  >("unknown");

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

  const dayFilters = useMemo(
    () =>
      days.map((day, index) => ({
        id: day.id,
        label: `第 ${index + 1} 天`,
        hint: day.summary ?? formatDateLabel(day.date),
      })),
    [days]
  );

  const filterButtons = useMemo(
    () => [
      {
        id: "all",
        label: "全部行程",
        hint: `${days.length} 天`,
      },
      ...dayFilters,
    ],
    [dayFilters, days.length]
  );

  const filteredActivities = useMemo(() => {
    if (visibleDayId === "all") {
      return flattenedActivities;
    }
    return flattenedActivities.filter((entry) => entry.day.id === visibleDayId);
  }, [flattenedActivities, visibleDayId]);

  const selectedEntry = useMemo(() => {
    if (!selectedActivityId) return null;
    return flattenedActivities.find((entry) => entry.activity.id === selectedActivityId) ?? null;
  }, [flattenedActivities, selectedActivityId]);

  const normalizedCityHint = useMemo(() => {
    if (!cityHint) return null;
    const text = cityHint.trim();
    return text.length > 0 ? text : null;
  }, [cityHint]);

  const activityHasCoordinates = useCallback((activity: TripMapActivity) => {
    return Boolean(activity.location || extractCoordinates(activity));
  }, []);

  const openInfoWindowForOverlay = useCallback((overlay: MapOverlay) => {
    if (!mapRef.current || !amapRef.current) return;
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
  }, []);

  const handleResetView = () => {
    if (visibleDayId !== "all") {
      setVisibleDayId("all");
    }
    if (mapRef.current) {
      mapRef.current.setFitView(undefined, undefined, [80, 80, 80, 80]);
    }
  };

  const instantiateMarkerOverlay = useCallback(
    (
      entry: {
        activity: TripMapActivity;
        day: TripMapDay;
        orderLabel: string;
      },
      coords: Coordinates
    ): MapOverlay | null => {
      if (!mapRef.current || !amapRef.current) {
        return null;
      }
      const amap = amapRef.current;
      const marker = new amap.Marker({
        position: new amap.LngLat(coords.lng, coords.lat),
        title: `${entry.orderLabel} ${getActivityName(entry.activity)}`,
        offset: new amap.Pixel(-10, -28),
        icon: createMarkerIcon(amap, entry.activity.type),
        extData: {
          activityId: entry.activity.id,
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
        content: entry.orderLabel,
      } as Parameters<AMap.Marker["setLabel"]>[0]);

      marker.on("click", () => {
        onActivitySelect?.(entry.activity.id);
      });

      return {
        marker,
        activityId: entry.activity.id,
        orderLabel: `${entry.day.summary ?? entry.day.date} · ${entry.orderLabel}`,
      };
    },
    [onActivitySelect]
  );

  const focusMarkerById = useCallback(
    (
      activityId: string,
      options?: {
        forceFit?: boolean;
        logLabel?: string;
      }
    ) => {
      if (!mapRef.current) return false;
      let overlay = overlaysRef.current.markers.find((item) => item.activityId === activityId);

      if (!overlay) {
        const fallbackEntry = flattenedActivities.find((entry) => entry.activity.id === activityId);
        const fallbackCoords = fallbackEntry ? extractCoordinates(fallbackEntry.activity) : null;
        if (fallbackEntry && fallbackCoords && mapRef.current) {
          const created = instantiateMarkerOverlay(fallbackEntry, fallbackCoords);
          if (created) {
            created.marker.setMap(mapRef.current);
            overlaysRef.current.markers.push(created);
            visibleMarkerIdsRef.current.add(activityId);
            overlay = created;
            setOverlayRevision((value) => value + 1);
          }
        }
      }

      if (!overlay) return false;
      const position = overlay.marker.getPosition();
      if (!position) return false;

      const center: [number, number] = [position.getLng(), position.getLat()];
      if (options?.forceFit) {
        const zoom = Math.max(mapRef.current.getZoom() ?? 12, 14);
        mapRef.current.setZoomAndCenter?.(zoom, center);
        mapRef.current.panTo?.(center);
        mapRef.current.setFitView?.([overlay.marker], false, [80, 80, 80, 80]);
      } else {
        mapRef.current.setCenter(center);
      }
      openInfoWindowForOverlay(overlay);

      if (options?.logLabel) {
        console.info(options.logLabel, {
          activityId,
          forceFit: Boolean(options.forceFit),
          center,
        });
      }
      return true;
    },
    [flattenedActivities, instantiateMarkerOverlay, openInfoWindowForOverlay]
  );

  const focusOnSelectedMarker = () => {
    if (!selectedActivityId) {
      console.warn("[TripMap] 定位失败：没有选中的活动");
      return;
    }
    if (selectedMarkerStatus === "missing") {
      console.warn("[TripMap] 定位失败：该活动缺少可用坐标", {
        selectedActivityId,
        visibleDayId,
      });
      return;
    }
    if (selectedMarkerStatus === "unknown") {
      pendingFocusIdRef.current = selectedActivityId;
      console.info("[TripMap] 地图覆盖物尚未准备好，等待后重试", { selectedActivityId });
      return;
    }

    const success = focusMarkerById(selectedActivityId, {
      forceFit: true,
      logLabel: "[TripMap] 在地图中定位活动",
    });
    if (!success) {
      pendingFocusIdRef.current = selectedActivityId;
      console.warn("[TripMap] 定位失败：找不到目标覆盖物，稍后重试", {
        selectedActivityId,
        visibleDayId,
      });
    } else {
      pendingFocusIdRef.current = null;
    }
  };

  const selectedSummary = selectedEntry ? getActivitySummary(selectedEntry.activity) : null;

  useEffect(() => {
    if (!selectedEntry) return;
    if (lastSelectedIdRef.current === selectedEntry.activity.id) {
      return;
    }
    lastSelectedIdRef.current = selectedEntry.activity.id;
    setVisibleDayId(selectedEntry.day.id);
  }, [selectedEntry]);

  useEffect(() => {
    if (!selectedActivityId) {
      lastSelectedIdRef.current = null;
    }
  }, [selectedActivityId]);

  useEffect(() => {
    const pendingId = pendingFocusIdRef.current;
    if (!pendingId) return;
    if (!selectedActivityId || pendingId !== selectedActivityId) {
      pendingFocusIdRef.current = null;
    }
  }, [selectedActivityId]);

  useEffect(() => {
    if (!selectedActivityId) return;
    const exists = filteredActivities.some((entry) => entry.activity.id === selectedActivityId);
    if (!exists && onActivitySelect) {
      console.info("[TripMap] 当前筛选条件下找不到选中的活动，清空选择", {
        selectedActivityId,
        visibleDayId,
      });
      onActivitySelect(null);
    }
  }, [filteredActivities, onActivitySelect, selectedActivityId, visibleDayId]);

  useEffect(() => {
    if (!onActivitySelect) return;
    if (lastVisibleDayRef.current === visibleDayId) {
      return;
    }
    const previousDay = lastVisibleDayRef.current;
    lastVisibleDayRef.current = visibleDayId;

    if (filteredActivities.length === 0) {
      console.info("[TripMap] 切换到没有活动的日期", {
        previousDay,
        visibleDayId,
      });
      return;
    }

    const hasSelected =
      !!selectedActivityId &&
      filteredActivities.some((entry) => entry.activity.id === selectedActivityId);

    if (hasSelected) {
      return;
    }

    const nextEntry =
      filteredActivities.find((entry) => activityHasCoordinates(entry.activity)) ??
      filteredActivities[0];
    if (!nextEntry) {
      console.info("[TripMap] 当前筛选下没有可选择的活动");
      return;
    }
    console.info("[TripMap] 切换日期后自动选中首个活动", {
      previousDay,
      visibleDayId,
      activityId: nextEntry.activity.id,
      hasCoordinates: activityHasCoordinates(nextEntry.activity),
    });
    onActivitySelect(nextEntry.activity.id);
  }, [
    activityHasCoordinates,
    filteredActivities,
    onActivitySelect,
    selectedActivityId,
    visibleDayId,
  ]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!loaderOptions.key) {
      setError("缺少高德地图应用 Key，请在环境变量中配置 NEXT_PUBLIC_AMAP_KEY。");
      setLoading(false);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    let destroyed = false;
    const geocodeFailureSet = geocodeFailureRef.current;
    const geocodePendingSet = geocodePendingRef.current;
    const missingLogSet = missingActivityLogRef.current;
    const routeCache = routeCacheRef.current;
    setLoading(true);
    setError(null);

    const loadMap = async () => {
      try {
        const { default: loader } = await import("@amap/amap-jsapi-loader");
        const amap = await loader.load(loaderOptions);
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
      } catch (reason) {
        console.error("[TripMap] 初始化高德地图失败", reason);
        if (destroyed) return;
        setError("加载高德地图失败，请稍后重试。");
        setLoading(false);
      }
    };

    loadMap();

    return () => {
      destroyed = true;
      overlaysRef.current.markers.forEach(({ marker }) => marker.setMap(null));
      overlaysRef.current.segments.forEach(({ polyline }) => polyline.setMap(null));
      overlaysRef.current = { markers: [], segments: [] };
      visibleMarkerIdsRef.current = new Set();
      geocodeFailureSet.clear();
      geocodePendingSet.clear();
      missingLogSet.clear();
      routeCache.clear();
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
    visibleMarkerIdsRef.current = new Set();
    geocodeFailureRef.current.clear();
    geocodePendingRef.current.clear();
    missingActivityLogRef.current.clear();
    setOverlayRevision((value) => value + 1);

    if (filteredActivities.length === 0) {
      setError(visibleDayId === "all" ? "当前行程暂无可展示的活动。" : "所选日期暂无活动内容。");
      return;
    }

    let disposed = false;

    const drawOverlays = async () => {
      const amap = amapRef.current;
      if (!amap) return;

      const tasks = filteredActivities.filter((entry) => {
        return Boolean(entry.activity.location || extractCoordinates(entry.activity));
      });

      if (tasks.length === 0) {
        setError("当前筛选的活动缺少位置信息，无法展示地图点位。");
        return;
      }

      const resolved = await Promise.all(
        tasks.map(async (entry) => {
          const coords = await resolveCoordinates(
            entry.activity,
            geocodeCacheRef.current,
            normalizedCityHint
          );
          if (coords) {
            missingActivityLogRef.current.delete(entry.activity.id);
            return { ...entry, coords };
          }

          const locationText = entry.activity.location ?? null;
          if (!missingActivityLogRef.current.has(entry.activity.id)) {
            missingActivityLogRef.current.add(entry.activity.id);
            const geocodeStatus = !locationText
              ? "no-location"
              : geocodeFailureRef.current.has(locationText)
                ? "geocode-failed"
                : geocodePendingRef.current.has(locationText)
                  ? "pending"
                  : "unknown";
            const inlineCoordsAvailable = Boolean(extractCoordinates(entry.activity));
            console.info("[TripMap] 无法为活动解析坐标", {
              activityId: entry.activity.id,
              location: locationText,
              geocodeStatus,
              hasInlineCoordinates: inlineCoordsAvailable,
              visibleDayId: entry.day.id,
            });
          }
          return null;
        })
      );

      if (disposed) return;

      const validEntries = resolved.filter(Boolean) as Array<
        (typeof tasks)[number] & { coords: Coordinates }
      >;

      if (validEntries.length === 0) {
        setError("未能获取这些活动的坐标，请稍后再试。");
        return;
      }

      setError(null);

      const markers: MapOverlay[] = [];
      validEntries.forEach((entry) => {
        const overlay = instantiateMarkerOverlay(entry, entry.coords);
        if (overlay) {
          markers.push(overlay);
        }
      });

      markers.forEach(({ marker }) => marker.setMap(mapRef.current!));
      overlaysRef.current.markers = markers;

      const dayGroups = groupEntriesByDay(validEntries);
      const segmentResults = await Promise.all(
        dayGroups.map(async ({ dayId, entries }) => {
          if (entries.length < 2) return [] as MapSegment[];
          const daySegments: MapSegment[] = [];
          for (let index = 0; index < entries.length - 1; index += 1) {
            const current = entries[index];
            const next = entries[index + 1];
            const path = await resolveRoutePath(current.coords, next.coords);
            if (!path || path.length < 2) {
              continue;
            }
            const polyline = new amap.Polyline({
              path: path.map((point) => [point.lng, point.lat]) as [number, number][],
              strokeColor: "#2563eb",
              strokeOpacity: 0.75,
              strokeWeight: 4,
              strokeStyle: "solid",
              lineJoin: "round",
              zIndex: 40,
            });
            polyline.setMap(mapRef.current!);
            daySegments.push({ polyline, dayId });
          }
          return daySegments;
        })
      );

      const segments = segmentResults.flat();
      overlaysRef.current.segments = segments;
      visibleMarkerIdsRef.current = new Set(validEntries.map((entry) => entry.activity.id));
      mapRef.current!.setFitView(undefined, undefined, [80, 80, 80, 80]);
      setOverlayRevision((value) => value + 1);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredActivities, onActivitySelect, visibleDayId, normalizedCityHint]);

  const selectedInlineCoordinates = useMemo(() => {
    if (!selectedEntry) return null;
    return extractCoordinates(selectedEntry.activity);
  }, [selectedEntry]);

  useEffect(() => {
    if (!selectedActivityId) {
      setSelectedMarkerStatus("missing");
      return;
    }
    if (loading) {
      setSelectedMarkerStatus("unknown");
      return;
    }
    const hasMarker = visibleMarkerIdsRef.current.has(selectedActivityId);
    if (hasMarker || selectedInlineCoordinates) {
      setSelectedMarkerStatus("available");
    } else {
      setSelectedMarkerStatus("missing");
    }
  }, [selectedActivityId, overlayRevision, loading, selectedInlineCoordinates]);

  useEffect(() => {
    if (!selectedActivityId) return;
    if (!visibleMarkerIdsRef.current.has(selectedActivityId)) {
      return;
    }
    focusMarkerById(selectedActivityId, { forceFit: false });
  }, [selectedActivityId, overlayRevision, focusMarkerById]);

  useEffect(() => {
    const targetId = pendingFocusIdRef.current;
    if (!targetId) return;
    if (selectedMarkerStatus !== "available") return;
    const success = focusMarkerById(targetId, {
      forceFit: true,
      logLabel: "[TripMap] 覆盖物准备就绪，完成延迟定位",
    });
    if (success) {
      pendingFocusIdRef.current = null;
    }
  }, [selectedMarkerStatus, focusMarkerById]);

  useEffect(() => {
    if (selectedMarkerStatus === "missing" && pendingFocusIdRef.current) {
      pendingFocusIdRef.current = null;
    }
  }, [selectedMarkerStatus]);

  useEffect(() => {
    if (selectedMarkerStatus !== "missing") return;
    if (!selectedEntry) return;
    const locationText = selectedEntry.activity.location?.trim() ?? null;
    const geocodeStatus = !locationText
      ? "no-location"
      : geocodeFailureRef.current.has(locationText)
        ? "geocode-failed"
        : geocodePendingRef.current.has(locationText)
          ? "pending"
          : "unknown";
    const inlineCoords = extractCoordinates(selectedEntry.activity);
    console.info("[TripMap] 当前活动缺少可解析坐标", {
      activityId: selectedEntry.activity.id,
      location: locationText,
      geocodeStatus,
      hasInlineCoordinates: Boolean(inlineCoords),
      visibleDayId,
    });
  }, [selectedEntry, selectedMarkerStatus, visibleDayId]);

  useEffect(() => {
    const highlightDayId = selectedEntry?.day.id ?? (visibleDayId !== "all" ? visibleDayId : null);
    const hasSelection = Boolean(selectedActivityId);

    overlaysRef.current.markers.forEach(({ marker, activityId }) => {
      const active = !hasSelection || activityId === selectedActivityId;
      marker.setOptions?.({
        zIndex: active ? 120 : 80,
        opacity: active ? 1 : 0.3,
      });
    });

    overlaysRef.current.segments.forEach(({ polyline, dayId }) => {
      const active = !highlightDayId || dayId === highlightDayId;
      polyline.setOptions?.({
        strokeOpacity: active ? 0.85 : 0.25,
        strokeWeight: active ? 5 : 3,
        zIndex: active ? 60 : 20,
      });
    });
  }, [selectedActivityId, selectedEntry, visibleDayId, overlayRevision]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-surface/70 p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {filterButtons.map((option) => (
              <button
                type="button"
                key={option.id}
                onClick={() => {
                  console.info("[TripMap] 用户切换地图日期筛选", {
                    previous: visibleDayId,
                    next: option.id,
                  });
                  setVisibleDayId(option.id);
                }}
                className={cn(
                  "rounded-2xl border px-3 py-1 text-xs text-muted transition hover:text-foreground",
                  visibleDayId === option.id && "border-primary/50 bg-primary/10 text-primary"
                )}
              >
                <span className="font-medium">{option.label}</span>
                <span className="ml-1 text-[11px] text-muted">{option.hint}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <button
              type="button"
              onClick={handleResetView}
              className="rounded-full border border-border px-3 py-1 font-medium text-foreground transition hover:border-foreground"
            >
              重置视图
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
          <MapLegend />
        </div>
      </div>

      <div className="relative h-80 w-full overflow-hidden rounded-3xl border border-border bg-muted/20 shadow-card">
        <div
          ref={containerRef}
          className={cn("h-full w-full", error && "opacity-40 blur-sm", loading && "opacity-60")}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-sm">
            <Spinner />
            <span className="ml-3 text-sm text-muted">正在加载地图...</span>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 grid place-items-center bg-background/90 text-sm text-muted">
            <span>{error}</span>
          </div>
        )}
        {!loading && !error && !selectedEntry && (
          <div className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-background/85 px-3 py-1 text-xs text-muted shadow">
            点击地图点位或活动卡片可查看详情
          </div>
        )}
      </div>
      {selectedEntry ? (
        <div className="rounded-2xl border border-border bg-surface/70 p-4 text-sm shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">
                {selectedEntry.day.summary ?? formatDateLabel(selectedEntry.day.date)}
              </p>
              <h3 className="text-base font-semibold text-foreground">
                {selectedEntry.orderLabel} · {getActivityName(selectedEntry.activity)}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={focusOnSelectedMarker}
                disabled={selectedMarkerStatus !== "available"}
                className={cn(
                  "rounded-full border border-border px-3 py-1 text-foreground transition",
                  selectedMarkerStatus === "available"
                    ? "hover:border-foreground"
                    : "cursor-not-allowed text-muted opacity-70"
                )}
                title={
                  selectedMarkerStatus === "missing"
                    ? "该活动缺少可定位的坐标"
                    : selectedMarkerStatus === "unknown"
                      ? "地图正在加载中"
                      : undefined
                }
              >
                {selectedMarkerStatus === "available"
                  ? "在地图中定位"
                  : selectedMarkerStatus === "unknown"
                    ? "地图加载中..."
                    : "无定位数据"}
              </button>
              <button
                type="button"
                onClick={() => onActivitySelect?.(null)}
                className="rounded-full border border-border px-3 py-1 text-muted transition hover:border-foreground hover:text-foreground"
              >
                清除选择
              </button>
            </div>
          </div>
          <dl className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
            <div>
              <dt className="font-medium text-foreground">活动类型</dt>
              <dd>{getActivityTypeLabel(selectedEntry.activity.type)}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">时间安排</dt>
              <dd>{formatActivityTimeRange(selectedEntry.activity)}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">位置</dt>
              <dd>{selectedEntry.activity.location ?? "待确认地点"}</dd>
            </div>
          </dl>
          {selectedSummary && <p className="mt-2 text-xs text-muted">{selectedSummary}</p>}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 px-4 py-3 text-xs text-muted">
          小技巧：点击上方的小方框可切换到指定日期，只查看当日路线；在活动卡片或地图点位上点击，即可在此查看详细信息。
        </div>
      )}
      <p className="text-xs text-muted">
        温馨提示：地图点位基于当前行程位置推算，如出现偏差可在下一任务中完善 POI 数据。
      </p>
    </div>
  );

  async function resolveCoordinates(
    activity: TripMapActivity,
    cache: Map<string, Coordinates>,
    cityHint?: string | null
  ): Promise<Coordinates | null> {
    const fromDetails = extractCoordinates(activity);
    if (fromDetails) return fromDetails;

    const location = activity.location?.trim();
    if (!location) return null;

    const geocoder = geocoderRef.current;
    const amap = amapRef.current;
    if (!geocoder || !amap) {
      if (!geocodeFailureRef.current.has(location)) {
        geocodeFailureRef.current.add(location);
        console.info("[TripMap] 地理编码器未就绪", {
          location,
          hasGeocoder: Boolean(geocoder),
          hasAmap: Boolean(amap),
        });
      }
      geocodePendingRef.current.delete(location);
      return null;
    }

    const candidates = buildGeocodeCandidates(location, cityHint);
    if (candidates.length === 0) {
      return null;
    }

    for (const candidate of candidates) {
      if (cache.has(candidate)) {
        const coords = cache.get(candidate)!;
        aliasGeocodeSuccess(coords, candidates, cache);
        return coords;
      }
    }

    for (const candidate of candidates) {
      const coords = await geocodeKeyword(candidate, geocoder, cityHint);
      if (coords) {
        aliasGeocodeSuccess(coords, candidates, cache);
        return coords;
      }

      const restCoords = await geocodeViaApi(candidate, cityHint);
      if (restCoords) {
        aliasGeocodeSuccess(restCoords, candidates, cache);
        return restCoords;
      }
    }

    candidates.forEach((key) => {
      geocodePendingRef.current.delete(key);
    });
    geocodeFailureRef.current.add(location);
    return null;
  }

  async function resolveRoutePath(
    origin: Coordinates,
    destination: Coordinates
  ): Promise<Coordinates[]> {
    const cacheKey = buildRouteCacheKey(origin, destination);
    if (routeCacheRef.current.has(cacheKey)) {
      return routeCacheRef.current.get(cacheKey)!;
    }

    const params = new URLSearchParams({
      origin: `${origin.lng},${origin.lat}`,
      destination: `${destination.lng},${destination.lat}`,
      mode: "driving",
    });

    try {
      const response = await fetch(`/api/directions?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json();
      if (response.ok && payload?.success && Array.isArray(payload?.data?.path)) {
        const coords = (payload.data.path as Coordinates[]).filter((point) => {
          return (
            point &&
            typeof point.lng === "number" &&
            Number.isFinite(point.lng) &&
            typeof point.lat === "number" &&
            Number.isFinite(point.lat)
          );
        });
        if (coords.length >= 2) {
          routeCacheRef.current.set(cacheKey, coords);
          return coords;
        }
      } else {
        console.info("[TripMap] 路线规划失败", {
          origin,
          destination,
          error: payload?.error ?? response.statusText,
        });
      }
    } catch (error) {
      console.warn("[TripMap] 请求路线规划失败", { origin, destination, error });
    }

    const fallback = [origin, destination];
    routeCacheRef.current.set(cacheKey, fallback);
    return fallback;
  }

  function buildRouteCacheKey(origin: Coordinates, destination: Coordinates) {
    return `${origin.lng},${origin.lat}->${destination.lng},${destination.lat}`;
  }

  function aliasGeocodeSuccess(
    coords: Coordinates,
    keys: string[],
    cache: Map<string, Coordinates>
  ) {
    keys.forEach((key) => {
      cache.set(key, coords);
      geocodePendingRef.current.delete(key);
      geocodeFailureRef.current.delete(key);
    });
  }

  function geocodeKeyword(
    keyword: string,
    geocoder: AMapGeocoder,
    cityHint?: string | null
  ): Promise<Coordinates | null> {
    const trimmed = keyword.trim();
    if (cityHint && geocoder.setCity) {
      try {
        geocoder.setCity(cityHint);
      } catch {
        // ignore
      }
    }
    if (!geocodePendingRef.current.has(trimmed)) {
      geocodePendingRef.current.add(trimmed);
      console.info("[TripMap] 地理编码请求发起", { location: trimmed });
    }

    return new Promise((resolve) => {
      try {
        geocoder.getLocation(trimmed, (status, result) => {
          const matchCount = result?.geocodes?.length ?? 0;
          if (status === "complete" && matchCount > 0) {
            const point = result!.geocodes![0]?.location;
            if (point) {
              const coords = { lng: point.getLng(), lat: point.getLat() };
              geocodePendingRef.current.delete(trimmed);
              geocodeFailureRef.current.delete(trimmed);
              console.info("[TripMap] 地理编码成功", { location: trimmed, coords });
              resolve(coords);
              return;
            }
          }
          geocodePendingRef.current.delete(trimmed);
          if (!geocodeFailureRef.current.has(trimmed)) {
            geocodeFailureRef.current.add(trimmed);
            console.info("[TripMap] 地理编码缺少返回结果", {
              location: trimmed,
              status,
              matchCount,
            });
          }
          resolve(null);
        });
      } catch (error) {
        geocodePendingRef.current.delete(trimmed);
        console.warn("[TripMap] 获取地理编码失败", { location: trimmed, error });
        resolve(null);
      }
    });
  }

  async function geocodeViaApi(keyword: string, cityHint?: string | null) {
    const trimmed = keyword.trim();
    try {
      const params = new URLSearchParams({ keyword: trimmed });
      if (cityHint?.trim()) {
        params.set("city", cityHint.trim());
      }
      const response = await fetch(`/api/geocode?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json();
      if (response.ok && payload?.success && payload?.data) {
        const coords = payload.data as Coordinates;
        geocodePendingRef.current.delete(trimmed);
        geocodeFailureRef.current.delete(trimmed);
        console.info("[TripMap] REST 地理编码成功", { location: trimmed, coords });
        return coords;
      }
      geocodeFailureRef.current.add(trimmed);
      console.info("[TripMap] REST 地理编码失败", {
        location: trimmed,
        error: payload?.error ?? response.statusText,
      });
      return null;
    } catch (error) {
      geocodeFailureRef.current.add(trimmed);
      console.warn("[TripMap] REST 地理编码调用异常", { location: trimmed, error });
      return null;
    }
  }

  function buildGeocodeCandidates(location: string, city?: string | null) {
    const candidates = new Set<string>();
    const segments = extractLocationSegments(location);
    const hint = city?.trim()?.replace(/\s+/g, " ") ?? null;

    segments.forEach((segment) => {
      if (segment) {
        candidates.add(segment);
      }
    });

    if (hint) {
      segments.forEach((segment) => {
        if (!segment) return;
        const combos = [
          `${hint}${segment}`,
          `${segment}${hint}`,
          `${hint} ${segment}`,
          `${segment} ${hint}`,
        ];
        combos.forEach((item) => {
          const normalized = item.replace(/\s+/g, " ").trim();
          if (normalized) {
            candidates.add(normalized);
          }
        });
      });
    }

    return Array.from(candidates);
  }

  function extractLocationSegments(raw: string) {
    const normalized = raw.replace(/\s+/g, " ").trim();
    const segments = new Set<string>();
    if (normalized) {
      segments.add(normalized);
    }

    const stripped = normalized
      .replace(/（.*?）|\(.*?\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped) {
      segments.add(stripped);
    }

    const parentheticalMatches = normalized.match(/（([^）]+)）|\(([^)]+)\)/g);
    if (parentheticalMatches) {
      parentheticalMatches.forEach((match) => {
        const content = match.replace(/[（）()]/g, "");
        content
          .split(/[\/、,，\s]+/)
          .map((item) => item.replace(/^(建议|推荐|靠近|附近)/g, "").trim())
          .filter((item) => item.length > 1)
          .forEach((item) => segments.add(item));
      });
    }

    return Array.from(segments);
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

function getActivityTypeLabel(type: string) {
  return activityTypeLabel[type] ?? "行程活动";
}

function formatDateLabel(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return parsed.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function formatActivityTimeRange(activity: TripMapActivity) {
  const format = (value: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const start = format(activity.startTime);
  const end = format(activity.endTime);
  if (start && end) return `${start} - ${end}`;
  if (start && !end) return `${start} 起`;
  if (!start && end) return `至 ${end}`;
  return "时间未定";
}

function getActivitySummary(activity: TripMapActivity) {
  const details = activity.details;
  if (details && typeof details === "object") {
    const summary = (details as Record<string, unknown>).summary;
    if (typeof summary === "string" && summary.trim()) {
      return summary.trim();
    }
  }
  return activity.location ?? null;
}

function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {Object.entries(activityTypeColor).map(([type, color]) => (
        <span key={type} className="flex items-center gap-1">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: color,
            }}
          />
          <span>{activityTypeLabel[type] ?? type}</span>
        </span>
      ))}
    </div>
  );
}
