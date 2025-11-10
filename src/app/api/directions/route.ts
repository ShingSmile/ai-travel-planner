import { NextRequest, NextResponse } from "next/server";

type DirectionMode = "driving" | "walking" | "cycling";

type DirectionResponse = {
  status: string;
  info: string;
  route?: {
    paths?: Array<{
      steps?: Array<{
        polyline?: string;
      }>;
    }>;
  };
};

type Coordinates = {
  lng: number;
  lat: number;
};

const SUPPORTED_MODES: DirectionMode[] = ["driving", "walking", "cycling"];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = parseCoordinate(searchParams.get("origin"));
  const destination = parseCoordinate(searchParams.get("destination"));
  const mode = parseMode(searchParams.get("mode"));

  if (!origin || !destination) {
    return NextResponse.json(
      { success: false, error: "origin 和 destination 参数不能为空，格式为 lng,lat。" },
      { status: 400 }
    );
  }

  const apiKey = process.env.AMAP_REST_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: "未配置 AMAP_REST_KEY" }, { status: 500 });
  }

  try {
    const endpoint = new URL(`https://restapi.amap.com/v5/direction/${mode}`);
    endpoint.searchParams.set("key", apiKey);
    endpoint.searchParams.set("origin", `${origin.lng},${origin.lat}`);
    endpoint.searchParams.set("destination", `${destination.lng},${destination.lat}`);
    endpoint.searchParams.set("show_fields", "polyline");
    endpoint.searchParams.set("output", "JSON");

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `AMap direction 接口返回 ${response.status}` },
        { status: response.status }
      );
    }

    const payload = (await response.json()) as DirectionResponse;
    const path = extractPolyline(payload);

    if (!path) {
      return NextResponse.json(
        { success: false, error: payload.info ?? "未获取到路线规划结果" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        path,
      },
    });
  } catch (error) {
    console.error("[api/directions] 调用高德路线接口失败", error);
    return NextResponse.json({ success: false, error: "调用高德路线接口失败" }, { status: 500 });
  }
}

function parseMode(value: string | null): DirectionMode {
  if (!value) return "driving";
  const normalized = value.toLowerCase() as DirectionMode;
  if ((SUPPORTED_MODES as string[]).includes(normalized)) {
    return normalized;
  }
  return "driving";
}

function parseCoordinate(value: string | null): Coordinates | null {
  if (!value) return null;
  const [lngText, latText] = value.split(",");
  const lng = Number.parseFloat(lngText);
  const lat = Number.parseFloat(latText);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

function extractPolyline(payload: DirectionResponse): Coordinates[] | null {
  if (payload.status !== "1") {
    return null;
  }
  const steps = payload.route?.paths?.[0]?.steps;
  if (!steps || steps.length === 0) {
    return null;
  }
  const points: Coordinates[] = [];
  steps.forEach((step, stepIndex) => {
    if (!step.polyline) return;
    const pairs = step.polyline.split(";");
    pairs.forEach((pair) => {
      const [lngText, latText] = pair.split(",");
      const lng = Number.parseFloat(lngText);
      const lat = Number.parseFloat(latText);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return;
      }
      // 避免与前一点重复
      const previous = points[points.length - 1];
      if (previous && previous.lng === lng && previous.lat === lat) {
        return;
      }
      points.push({ lng, lat });
    });
    // 如果当前 step 没有 polyline，但并非最后一个 step，至少保留一次衔接
    if ((!step.polyline || step.polyline.trim() === "") && stepIndex > 0) {
      const prevStep = steps[stepIndex - 1];
      if (prevStep?.polyline) {
        const lastPair = prevStep.polyline.split(";").pop();
        if (lastPair) {
          const [lngText, latText] = lastPair.split(",");
          const lng = Number.parseFloat(lngText);
          const lat = Number.parseFloat(latText);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            points.push({ lng, lat });
          }
        }
      }
    }
  });

  return points.length >= 2 ? points : null;
}
