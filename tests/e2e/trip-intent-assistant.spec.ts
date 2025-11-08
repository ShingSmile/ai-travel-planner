import { test, expect, Page } from "@playwright/test";
import { setupMediaRecorderMocks, mockVoiceSuccess } from "./utils/voice";

const mockIntent = {
  id: "intent-mock",
  source: "text",
  rawInput: "我想去东京，4 月 1 日到 4 月 5 日，预算 1 万，2 大 1 小，美食动漫",
  destinations: ["东京"],
  dateRange: {
    startDate: "2025-04-01",
    endDate: "2025-04-05",
    durationDays: 5,
  },
  budget: {
    amount: 10000,
    currency: "CNY",
  },
  travelParty: {
    total: 3,
    adults: 2,
    kids: 1,
    hasKids: true,
    description: "3 人 / 2 大 1 小",
  },
  preferences: ["美食", "动漫"],
  confidence: 0.88,
  fieldConfidences: {
    destination: 0.9,
    date: 0.8,
    budget: 0.7,
    travelers: 0.6,
    preferences: 0.5,
  },
  transcriptId: null,
  voiceInputId: null,
  createdAt: new Date().toISOString(),
  status: "parsed",
};

function getAssistantSection(page: Page) {
  return page.locator("section:has(h2:has-text('一句话描述行程，自动填表'))").first();
}

test.describe("TripIntentAssistant", () => {
  test("文本解析后可自动填表", async ({ page }) => {
    const sampleText = mockIntent.rawInput;

    await page.route("**/api/trip-intents", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.rawInput).toContain("东京");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            intent: mockIntent,
          },
        }),
      });
    });

    await page.goto("/planner/new");

    await page
      .getByPlaceholder("输入或粘贴一段旅行意图，点击解析即可自动拆解字段")
      .fill(sampleText);
    await page.getByRole("button", { name: "解析文本" }).click();

    const assistant = getAssistantSection(page);
    await expect(assistant.getByText("解析结果")).toBeVisible();
    await assistant.getByRole("button", { name: "应用到表单" }).click();

    await expect(page.getByLabel("目的地")).toHaveValue("东京");
    await expect(page.getByLabel("开始日期")).toHaveValue("2025-04-01");
    await expect(page.getByLabel("结束日期")).toHaveValue("2025-04-05");
    await expect(page.getByLabel("预算（元）")).toHaveValue("10000");
    await expect(page.getByLabel("补充说明")).toContainText("东京");

    const tagChip = page.locator("span.inline-flex").filter({ hasText: "美食" }).first();
    await expect(tagChip).toBeVisible();
  });

  test("语音解析返回 tripIntent 后展示结果", async ({ page }) => {
    await setupMediaRecorderMocks(page);

    await page.route("**/api/voice-inputs", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await mockVoiceSuccess(route, {
        transcript: mockIntent.rawInput,
        tripIntent: { ...mockIntent, source: "voice" },
      });
    });

    await page.goto("/planner/new");

    const assistant = getAssistantSection(page);
    await assistant.getByRole("button", { name: "开始录音" }).click();
    await assistant.getByRole("button", { name: "停止录制" }).click();
    await assistant.getByRole("button", { name: "上传并识别" }).click();

    await expect(assistant.getByText("解析结果")).toBeVisible();
    await assistant.getByRole("button", { name: "应用到表单" }).click();
    await expect(page.getByLabel("目的地")).toHaveValue("东京");
  });
});
