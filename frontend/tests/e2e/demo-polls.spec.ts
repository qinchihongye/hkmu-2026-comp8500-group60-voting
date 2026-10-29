import { expect, test, type Page } from "@playwright/test";

import { login } from "./support";

const voterPassword = process.env.DEMO_VOTER_PASSWORD ?? "comp8500sefgroup60";
const pollPassword = process.env.DEMO_POLL_PASSWORD ?? "comp8500sefgroup60";

async function openExamples(page: Page): Promise<void> {
  await login(page, "demo_voter", voterPassword);
  const response = page.waitForResponse((item) => item.url().includes("/api/v1/demo-polls"));
  await page.goto("/overview");
  const body = (await (await response).json()) as { data?: { total?: number } };
  if (!body.data?.total) {
    test.skip(true, "固定示例未启用");
  }
  await expect(page.getByTestId("demo-polls")).toBeVisible();
}

test.describe("固定示例", () => {
  test("进行中的实时结果按开关区分", async ({ page }) => {
    await openExamples(page);
    const section = page.getByTestId("demo-polls");
    await section.getByPlaceholder("Search examples").fill("Technical sharing topics · A01");
    const hiddenLink = section.getByRole("link", { name: "Technical sharing topics · A01" });
    await expect(hiddenLink).toBeVisible();
    const hiddenHref = await hiddenLink.getAttribute("href");
    await page.goto(`${hiddenHref}/results`);
    await expect(page.getByText("Results are not available yet.")).toBeVisible();

    await page.goto("/overview");
    await section.getByPlaceholder("Search examples").fill("Technical sharing topics · A02");
    await section.getByRole("link", { name: "Technical sharing topics · A02" }).click();
    await page.getByRole("link", { name: "View results" }).click();
    await expect(page.getByText("React concurrency")).toBeVisible();
  });

  test("私密关闭示例先进入密码流程", async ({ page }) => {
    await openExamples(page);
    const section = page.getByTestId("demo-polls");
    await section.getByPlaceholder("Search examples").fill("Completed team decision");
    await section.getByRole("link", { name: "View results" }).click();
    await page.getByRole("link", { name: "Enter passcode" }).click();
    await page.getByLabel("Passcode", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText("The passcode is incorrect.")).toBeVisible();
    await page.getByLabel("Passcode", { exact: true }).fill(pollPassword);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByRole("heading", { name: "Completed team decision" })).toBeVisible();
    await expect(page.getByText("Keep the current scope")).toBeVisible();
  });

  test("隔离数据集才试投最后一名额和匿名空场", async ({ page }) => {
    test.skip(process.env.DEMO_POLLS_ISOLATED !== "1", "避免把试投写进开发库的固定示例");
    await openExamples(page);
    const section = page.getByTestId("demo-polls");
    await section.getByPlaceholder("Search examples").fill("Final workshop place");
    await section.getByRole("link", { name: "Final workshop place" }).click();
    await page.getByRole("radio", { name: "Frontend lab" }).check();
    await page.getByRole("button", { name: "Submit vote" }).click();
    await expect(page.getByText(/Submitted/)).toBeVisible();
  });
});
