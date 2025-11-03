import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit, resolveRateLimitNumber } from "@/lib/rate-limit";

const GLOBAL_RATE_LIMIT_WINDOW_MS = resolveRateLimitNumber(
  process.env.GLOBAL_API_RATE_LIMIT_WINDOW_MS,
  60_000
);
const GLOBAL_RATE_LIMIT_MAX = resolveRateLimitNumber(process.env.GLOBAL_API_RATE_LIMIT_MAX, 120);

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const identifier = getRequestIdentifier(request);
  const result = consumeRateLimit({
    bucket: "global_api",
    identifier,
    windowMs: GLOBAL_RATE_LIMIT_WINDOW_MS,
    limit: GLOBAL_RATE_LIMIT_MAX,
  });

  const nextResponse = result.allowed
    ? NextResponse.next()
    : NextResponse.json(
        {
          success: false,
          error: {
            message: "请求过于频繁，请稍后再试。",
            code: "global_rate_limited",
          },
        },
        { status: 429 }
      );

  Object.entries(result.headers).forEach(([key, value]) => {
    nextResponse.headers.set(key, value);
  });

  return nextResponse;
}

export const config = {
  matcher: ["/api/:path*"],
};

function getRequestIdentifier(request: NextRequest) {
  const requestWithIp = request as NextRequest & { ip?: string | null };
  if (requestWithIp.ip) {
    return requestWithIp.ip;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  return "anonymous";
}
