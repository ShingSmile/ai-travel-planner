import { test, expect } from "@playwright/test";

test.describe("分享链接只读页面", () => {
  test("展示默认的不可访问提示", async ({ page }) => {
    await page.goto("/trips/demo-trip/share");
    await expect(page.getByRole("heading", { name: "无法访问行程" })).toBeVisible();
    await expect(page.getByText("该行程暂不可分享")).toBeVisible();
  });

  test("打印模式下依然可以看到行程分享标题", async ({ page }) => {
    await page.goto("/trips/demo-trip/share?print=1");
    await expect(page.getByText("行程分享")).toBeVisible();
  });
});
