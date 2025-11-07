import { test, expect, Route } from "@playwright/test";

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test.describe("多行程管理体验", () => {
  test("新建行程后可在列表页看到草稿", async ({ page }) => {
    const newTripId = "5a1cf8f0-b111-4d53-9c79-b7bf5b220001";
    const createdAt = "2025-05-01T02:00:00.000Z";
    const newTripTitle = "厦门周末美食漫游";

    await page.route("**/api/trips", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body.title).toBe(newTripTitle);
      expect(body.destination).toBe("厦门");

      await fulfillJson(
        route,
        {
          success: true,
          data: {
            trip: {
              id: newTripId,
              title: newTripTitle,
              destination: "厦门",
              start_date: "2025-05-16",
              end_date: "2025-05-18",
              status: "draft",
              budget: "3200",
              tags: ["美食", "城市漫游"],
              created_at: createdAt,
              updated_at: createdAt,
            },
          },
        },
        201
      );
    });

    await page.goto("/planner/new");

    await page.getByLabel("行程标题").fill(newTripTitle);
    await page.getByLabel("目的地").fill("厦门");
    await page.getByLabel("开始日期").fill("2025-05-16");
    await page.getByLabel("结束日期").fill("2025-05-18");
    await page.getByLabel("预算（元）").fill("3200");
    await page.getByRole("textbox", { name: "补充说明" }).fill("想专注沙坡尾和曾厝垵的本地小吃。");

    await page.getByRole("button", { name: "保存并生成草稿" }).click();
    await page.waitForURL(`**/trips/${newTripId}/generate`);

    await page.route("**/api/trips?**", async (route) => {
      await fulfillJson(route, {
        success: true,
        data: {
          trips: [
            {
              id: newTripId,
              title: newTripTitle,
              destination: "厦门",
              start_date: "2025-05-16",
              end_date: "2025-05-18",
              status: "draft",
              budget: "3200",
              tags: ["美食", "城市漫游"],
              created_at: createdAt,
              updated_at: "2025-05-02T06:00:00.000Z",
            },
          ],
        },
      });
    });

    await page.goto("/trips");
    const tripCard = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: newTripTitle }) });

    await expect(tripCard).toBeVisible();
    await expect(tripCard).toContainText("厦门");
    await expect(tripCard).toContainText("预估预算");
    await expect(tripCard.getByRole("link", { name: "查看详情" })).toBeVisible();
  });

  test("行程列表可跳转至详情页并展示关键信息", async ({ page }) => {
    const firstTrip = {
      id: "5a1cf8f0-b111-4d53-9c79-b7bf5b220002",
      title: "苏州园林周末",
      destination: "苏州",
      start_date: "2025-08-01",
      end_date: "2025-08-03",
      status: "ready",
      budget: "4500",
      tags: ["慢节奏"],
      created_at: "2025-07-15T04:00:00.000Z",
      updated_at: "2025-07-20T09:30:00.000Z",
    };
    const secondTrip = {
      id: "5a1cf8f0-b111-4d53-9c79-b7bf5b220003",
      title: "青岛亲子海边假期",
      destination: "青岛",
      start_date: "2025-07-10",
      end_date: "2025-07-14",
      status: "draft",
      budget: "5200",
      tags: ["亲子"],
      created_at: "2025-06-01T08:00:00.000Z",
      updated_at: "2025-06-02T10:00:00.000Z",
    };

    await page.route(`**/api/trips/${firstTrip.id}`, async (route) => {
      await fulfillJson(route, {
        success: true,
        data: {
          trip: {
            id: firstTrip.id,
            title: firstTrip.title,
            destination: firstTrip.destination,
            startDate: firstTrip.start_date,
            endDate: firstTrip.end_date,
            status: "ready",
            budget: "4500",
            budgetBreakdown: {
              currency: "CNY",
              total: 4200,
              breakdown: [
                { category: "住宿", amount: 1800, percentage: 42, description: "园林附近精品民宿" },
                { category: "餐饮", amount: 900, percentage: 22 },
                { category: "交通", amount: 500, percentage: 12 },
              ],
              tips: ["建议提早预约拙政园讲解，节省排队时间。"],
            },
            travelers: [],
            tags: ["慢节奏"],
            createdAt: firstTrip.created_at,
            updatedAt: firstTrip.updated_at,
            days: [
              {
                id: "day-sz-1",
                date: "2025-08-01",
                summary: "拙政园与博物馆文化日",
                notes: "上午尽量提前入园，下午安排轻松步行线路。",
                createdAt: firstTrip.created_at,
                updatedAt: firstTrip.updated_at,
                activities: [
                  {
                    id: "act-sz-1",
                    type: "attraction",
                    startTime: "2025-08-01T02:00:00.000Z",
                    endTime: "2025-08-01T05:00:00.000Z",
                    location: "拙政园",
                    cost: "120",
                    currency: "CNY",
                    status: "planned",
                    details: {
                      notes: "预约讲解，避免临时排队。",
                    },
                    createdAt: firstTrip.created_at,
                    updatedAt: firstTrip.updated_at,
                  },
                ],
              },
            ],
          },
        },
      });
    });

    await page.route("**/api/trips?**", async (route) => {
      await fulfillJson(route, {
        success: true,
        data: {
          trips: [firstTrip, secondTrip],
        },
      });
    });

    await page.goto("/trips");
    const suzhouCard = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: firstTrip.title }) });
    await expect(suzhouCard).toContainText("苏州");

    await suzhouCard.getByRole("link", { name: "查看详情" }).click();
    await page.waitForURL(`**/trips/${firstTrip.id}`);

    await expect(page.getByRole("heading", { name: firstTrip.title })).toBeVisible();
    await expect(page.getByText(`目的地：${firstTrip.destination}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "拙政园与博物馆文化日" })).toBeVisible();
    await expect(page.getByText("预约讲解，避免临时排队。")).toBeVisible();
  });
});
