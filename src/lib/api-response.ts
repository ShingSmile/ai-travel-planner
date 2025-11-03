import { NextResponse } from "next/server";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>(
    {
      success: true,
      data,
    },
    init ?? { status: 200 }
  );
}

export function fail(message: string, init?: ResponseInit & { code?: string; details?: unknown }) {
  const { code, details, status, headers } = init ?? {};
  return NextResponse.json<ApiError>(
    {
      success: false,
      error: {
        message,
        code,
        details,
      },
    },
    {
      status: status ?? 400,
      headers,
    }
  );
}

export class ApiErrorResponse extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;
  public readonly exposeDetails: boolean;
  public readonly headers?: HeadersInit;

  constructor(
    message: string,
    status = 400,
    code?: string,
    details?: unknown,
    options?: {
      exposeDetails?: boolean;
      headers?: HeadersInit;
    }
  ) {
    super(message);
    this.name = "ApiErrorResponse";
    this.status = status;
    this.code = code;
    this.details = details;
    this.exposeDetails = options?.exposeDetails ?? false;
    this.headers = options?.headers;
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiErrorResponse) {
    const shouldExposeDetails = error.exposeDetails || process.env.NODE_ENV !== "production";
    const details = shouldExposeDetails ? error.details : undefined;
    return fail(error.message, {
      status: error.status,
      code: error.code,
      details,
      headers: error.headers,
    });
  }

  console.error("[API] 未捕获的异常：", error);
  return fail("服务器内部错误，请稍后重试。", {
    status: 500,
  });
}
