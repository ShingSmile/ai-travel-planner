"use client";

let cachedToken: string | null | undefined;

function normalizeBypassToken(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value === "0" || value.toLowerCase() === "false") {
    return null;
  }
  if (value === "1" || value.toLowerCase() === "true") {
    return "playwright-bypass-token";
  }
  return value;
}

/**
 * 返回 Playwright 端到端测试注入的伪造访问令牌。
 * 若未开启 bypass，则返回 null。
 */
export function getPlaywrightBypassToken(): string | null {
  if (cachedToken !== undefined) {
    return cachedToken;
  }

  const raw =
    process.env.NEXT_PUBLIC_PLAYWRIGHT_BYPASS_AUTH ?? process.env.PLAYWRIGHT_BYPASS_AUTH ?? null;
  cachedToken = normalizeBypassToken(raw);
  return cachedToken;
}

export function isPlaywrightBypassEnabled(): boolean {
  return getPlaywrightBypassToken() !== null;
}
