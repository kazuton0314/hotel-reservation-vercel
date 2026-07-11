import { expect, test } from "@playwright/test";

test("top-level navigation loads", async ({ page }) => {
  await page.goto("/");

  const loginField = page.locator("#login-email");
  if (await loginField.isVisible()) {
    await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
    return;
  }

  await expect(page.getByRole("heading", { name: "予約管理" })).toBeVisible();
  await page.goto("/reservations");
  await expect(page.getByRole("heading", { name: "本予約" })).toBeVisible();
  await page.goto("/requests");
  await expect(page.getByRole("heading", { name: "リクエスト" })).toBeVisible();
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "顧客索引" })).toBeVisible();
  await page.goto("/rooms");
  await expect(page.getByRole("heading", { name: "部屋割りボード" })).toBeVisible();
});
