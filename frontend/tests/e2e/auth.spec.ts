import { expect, test } from "@playwright/test";

import { guestToken, login, logout, register, uniqueName } from "./support";

test("注册登录刷新和注销不把公开页赶去登录，也不更换匿名凭据", async ({ page }) => {
  const username = uniqueName("ada");
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);
  const guest = await guestToken(page);

  await register(page, username, "艾达");
  await login(page, username);
  expect(await guestToken(page)).toBe(guest);
  await page.reload();
  await expect(page.getByText("艾达")).toBeVisible();
  expect(await guestToken(page)).toBe(guest);
  await logout(page);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  expect(await guestToken(page)).toBe(guest);
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  expect(await guestToken(page)).toBe(guest);
});
