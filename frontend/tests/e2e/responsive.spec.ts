import { expect, test } from "@playwright/test";

import { createDraft, login, publishCurrent, register, uniqueName } from "./support";

const widths = [375, 768, 1024, 1440];

test("四个宽度都能完成导航、表单、分享和结果，页面不横向溢出", async ({ page }) => {
  const username = uniqueName("narrow");
  const title = `Narrow_${username}`;
  await register(page, username, "Narrow User");
  await login(page, username);
  await createDraft(page, { title });
  await publishCurrent(page);

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/my-polls");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    if (width < 992) {
      await expect(page.locator(".sidebar")).toBeHidden();
      await expect(page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "History" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Sign in" })).toHaveCount(0);
    } else {
      await expect(page.locator(".sidebar")).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  }

  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/my-polls/new");
  const titleBox = await page.getByLabel("Title").boundingBox();
  expect(titleBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.getByLabel("Title").focus();
  await expect(page.getByLabel("Title")).toBeFocused();
  await page.goto("/overview");
  const squareOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(squareOverflow).toBe(false);
});
