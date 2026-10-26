import { expect, test } from "@playwright/test";

import { accessPassword, adminPassword, apiPost, createDraft, login, publishCurrent, register, uniqueName } from "./support";

test("管理员能看他人私密和进行中汇总，但不能写", async ({ browser, playwright }) => {
  const creatorName = uniqueName("owner");
  const title = `监督${creatorName}`;
  const creatorContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const admin = await adminContext.newPage();

  await register(creator, creatorName, "被监督的人");
  await login(creator, creatorName);
  await createDraft(creator, { title, anonymous: true, visibility: "PRIVATE", password: accessPassword });
  await publishCurrent(creator);

  await login(admin, "admin", adminPassword);
  await admin.goto("/admin/polls");
  await admin.getByLabel("Search by title").fill(title);
  await admin.getByRole("button", { name: "Filter" }).click();
  await admin.getByRole("link", { name: title }).click();
  await expect(admin.getByText("You did not create this poll")).toBeVisible();
  await expect(admin.getByTestId("publish")).toHaveCount(0);
  await expect(admin.getByTestId("close")).toHaveCount(0);
  await expect(admin.getByTestId("save-poll")).toHaveCount(0);
  await expect(admin.getByTestId("results")).toContainText("Current lead");

  const pollPath = new URL(admin.url()).pathname;
  const pollId = pollPath.split("/").at(-1);
  const api = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
  const loginResponse = await apiPost(api, "/api/v1/auth/login", { username: "admin", password: adminPassword });
  expect(loginResponse.ok()).toBeTruthy();
  const body = (await loginResponse.json()) as { data: { csrf_token: string } };
  const csrf = body.data.csrf_token;
  const denied = await api.patch(`/api/v1/polls/${pollId}`, {
    data: {
      data: {
        title: "越权修改",
        description: null,
        starts_at: "2026-10-24T00:00:00+08:00",
        ends_at: "2026-10-24T04:00:00+08:00",
        identity_mode: "ANONYMOUS",
        visibility: "PRIVATE",
        access_password: null,
        options: [{ label: "甲" }, { label: "乙" }],
        expected_version: 2,
      },
    },
    headers: { Origin: "http://localhost:5173", "X-CSRF-Token": csrf },
  });
  expect(denied.status()).toBe(403);

  await admin.goto("/admin/audit");
  await expect(admin.getByRole("columnheader", { name: "Action" })).toBeVisible();
  await expect(admin.getByRole("columnheader", { name: "Option" })).toHaveCount(0);
  await api.dispose();
  await creatorContext.close();
  await adminContext.close();
});
