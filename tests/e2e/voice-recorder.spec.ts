import { test, expect } from "@playwright/test";
import { setupMediaRecorderMocks, mockVoiceSuccess, mockVoiceFailure } from "./utils/voice";

test.describe("语音识别体验验证", () => {
  test.beforeEach(async ({ page }) => {
    await setupMediaRecorderMocks(page);
  });

  test("新建行程页面语音备注识别成功", async ({ page }) => {
    const transcript = "我们计划六月底去成都玩三天，想专注美食和市区漫游。";

    await page.route("**/api/voice-inputs", async (route) => {
      if (route.request().method() === "POST") {
        await mockVoiceSuccess(route, { transcript });
        return;
      }
      await route.continue();
    });

    await page.goto("/test/voice-scenarios");

    const plannerSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "行程备注语音录入" }) });

    await plannerSection.getByRole("button", { name: "开始录音" }).click();
    await plannerSection.getByRole("button", { name: "停止录制" }).click();

    const uploadButton = plannerSection.getByRole("button", { name: "上传并识别" });
    await expect(uploadButton).toBeVisible();
    await uploadButton.click();

    await expect(plannerSection.getByLabel("行程备注")).toHaveValue(new RegExp(transcript));
  });

  test("费用面板语音识别失败时给出友好提示", async ({ page }) => {
    const errorMessage = "语音识别失败（测试）";

    await page.route("**/api/voice-inputs", async (route) => {
      if (route.request().method() === "POST") {
        await mockVoiceFailure(route, errorMessage);
        return;
      }
      await route.continue();
    });

    await page.goto("/test/voice-scenarios");

    const expenseSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "费用语音录入" }) });

    await expenseSection.getByRole("button", { name: "开始录音" }).click();
    await expenseSection.getByRole("button", { name: "停止录制" }).click();
    await expenseSection.getByRole("button", { name: "上传并识别" }).click();

    await expect(expenseSection.getByText(errorMessage)).toBeVisible();
  });
});
