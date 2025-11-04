import { defineConfig, devices } from "@playwright/test";

const bypassToken =
  process.env.NEXT_PUBLIC_PLAYWRIGHT_BYPASS_AUTH ??
  process.env.PLAYWRIGHT_BYPASS_AUTH ??
  "playwright-bypass-token";

const e2eEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "public-anon-key",
  NEXT_PUBLIC_PLAYWRIGHT_BYPASS_AUTH: bypassToken,
  PLAYWRIGHT_BYPASS_AUTH: bypassToken,
  SUPABASE_URL: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "service-role-key",
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    env: e2eEnv,
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: "ignore",
    stderr: "pipe",
    env: e2eEnv,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
