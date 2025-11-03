export interface RateLimitConfig {
  /**
   * 限流窗口时长（毫秒）
   */
  windowMs: number;
  /**
   * 窗口内允许的最大请求数
   */
  limit: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter: number;
  headers: Record<string, string>;
}

interface RateLimitEntry {
  count: number;
  expiresAt: number;
}

type RateLimitStore = Map<string, Map<string, RateLimitEntry>>;

interface GlobalRateLimitStore {
  __rateLimitStore?: RateLimitStore;
}

function getGlobalStore(): RateLimitStore {
  const globalScope = globalThis as typeof globalThis & GlobalRateLimitStore;
  if (!globalScope.__rateLimitStore) {
    globalScope.__rateLimitStore = new Map();
  }
  return globalScope.__rateLimitStore;
}

function getBucket(store: RateLimitStore, bucket: string) {
  let bucketStore = store.get(bucket);
  if (!bucketStore) {
    bucketStore = new Map();
    store.set(bucket, bucketStore);
  }
  return bucketStore;
}

export interface ConsumeRateLimitOptions extends RateLimitConfig {
  /**
   * 在同一限流桶内使用的标识符，例如用户 ID 或 IP。
   */
  identifier: string;
  /**
   * 限流桶名称，用于区分不同的业务场景。
   */
  bucket: string;
  /**
   * 当前时间戳，默认 `Date.now()`。
   */
  now?: number;
}

export function consumeRateLimit({
  identifier,
  bucket,
  windowMs,
  limit,
  now = Date.now(),
}: ConsumeRateLimitOptions): RateLimitResult {
  if (!identifier) {
    throw new Error("consumeRateLimit 需要有效的 identifier");
  }
  if (limit <= 0) {
    throw new Error("limit 需要为正整数");
  }
  if (windowMs <= 0) {
    throw new Error("windowMs 需要为正整数");
  }

  const store = getGlobalStore();
  const bucketStore = getBucket(store, bucket);
  const existing = bucketStore.get(identifier);

  if (!existing || existing.expiresAt <= now) {
    const expiresAt = now + windowMs;
    bucketStore.set(identifier, {
      count: 1,
      expiresAt,
    });
    return buildResult({
      allowed: true,
      count: 1,
      limit,
      now,
      expiresAt,
    });
  }

  if (existing.count >= limit) {
    return buildResult({
      allowed: false,
      count: existing.count,
      limit,
      now,
      expiresAt: existing.expiresAt,
    });
  }

  existing.count += 1;
  bucketStore.set(identifier, existing);
  return buildResult({
    allowed: true,
    count: existing.count,
    limit,
    now,
    expiresAt: existing.expiresAt,
  });
}

interface BuildResultInput {
  allowed: boolean;
  count: number;
  limit: number;
  now: number;
  expiresAt: number;
}

function buildResult({ allowed, count, limit, now, expiresAt }: BuildResultInput): RateLimitResult {
  const remaining = Math.max(0, limit - count);
  const retryAfterMs = Math.max(0, expiresAt - now);
  const retryAfter = Math.ceil(retryAfterMs / 1000);

  const headers: Record<string, string> = {
    "RateLimit-Limit": `${limit}`,
    "RateLimit-Remaining": `${remaining}`,
    "RateLimit-Reset": `${Math.ceil(expiresAt / 1000)}`,
  };

  if (!allowed) {
    headers["Retry-After"] = `${retryAfter}`;
  }

  return {
    allowed,
    remaining,
    resetAt: expiresAt,
    retryAfter,
    headers,
  };
}

export function resolveRateLimitNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
