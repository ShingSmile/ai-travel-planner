import { NextRequest, NextResponse } from "next/server";

type GeocodeResponse = {
  status: string;
  info: string;
  geocodes?: Array<{
    location?: string;
  }>;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword")?.trim();
  const city = searchParams.get("city")?.trim();

  if (!keyword) {
    return NextResponse.json(
      { success: false, error: "缺少 keyword 参数" },
      {
        status: 400,
      }
    );
  }

  const apiKey = process.env.AMAP_REST_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "未配置 AMAP_REST_KEY" },
      {
        status: 500,
      }
    );
  }

  try {
    const endpoint = new URL("https://restapi.amap.com/v3/geocode/geo");
    endpoint.searchParams.set("key", apiKey);
    endpoint.searchParams.set("address", keyword);
    endpoint.searchParams.set("output", "JSON");
    if (city) {
      endpoint.searchParams.set("city", city);
    }

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `AMap REST 接口返回 ${response.status}`,
        },
        { status: response.status }
      );
    }

    const payload = (await response.json()) as GeocodeResponse;

    if (payload.status === "1" && payload.geocodes?.length) {
      const direct = parseLocation(payload.geocodes[0]?.location);
      if (direct) {
        return NextResponse.json({ success: true, data: direct });
      }
    }

    const placeMatch = await lookupPlaceCoordinate(keyword, city ?? null, apiKey);
    if (placeMatch) {
      return NextResponse.json({ success: true, data: placeMatch });
    }

    return NextResponse.json({
      success: false,
      error: payload.info ?? "未找到匹配的地理编码结果",
    });
  } catch (error) {
    console.error("[api/geocode] 调用高德 REST 接口失败", error);
    return NextResponse.json(
      { success: false, error: "调用高德 REST 接口失败" },
      {
        status: 500,
      }
    );
  }
}

function parseLocation(location?: string | null) {
  if (!location || !location.includes(",")) {
    return null;
  }
  const [lngText, latText] = location.split(",");
  const lng = Number.parseFloat(lngText);
  const lat = Number.parseFloat(latText);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }
  return { lng, lat };
}

async function lookupPlaceCoordinate(keyword: string, city: string | null, apiKey: string) {
  try {
    const endpoint = new URL("https://restapi.amap.com/v5/place/text");
    endpoint.searchParams.set("key", apiKey);
    endpoint.searchParams.set("keywords", keyword);
    endpoint.searchParams.set("page_size", "1");
    endpoint.searchParams.set("output", "JSON");
    endpoint.searchParams.set("show_fields", "location");
    if (city) {
      endpoint.searchParams.set("city", city);
    }

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      status?: string;
      pois?: Array<{ location?: string }>;
    };
    if (payload.status !== "1" || !payload.pois?.length) {
      return null;
    }
    return parseLocation(payload.pois[0]?.location ?? null);
  } catch {
    return null;
  }
}
