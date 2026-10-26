import { expect, test } from "@playwright/test";

import { accessPassword, createDraft, login, publishCurrent, register, uniqueName } from "./support";

test("创建者发布后冻结规则，分享链接不含密码，旧版本保存被拒绝", async ({ browser }) => {
  const username = uniqueName("maker");
  const title = `场次${username}`;
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await register(pageA, username, "创建者");
  await login(pageA, username);
  await login(pageB, username);

  await createDraft(pageA, { title, visibility: "PRIVATE", password: accessPassword });
  const editUrl = pageA.url().replace(/\/?$/, "/edit");
  await pageA.goto(editUrl);
  await pageB.goto(editUrl);
  await expect(pageA.getByLabel("Title")).toHaveValue(title);
  await expect(pageB.getByLabel("Title")).toHaveValue(title);
  await pageA.getByLabel("Title").fill(`${title}新`);
  await pageA.getByTestId("save-poll").click();
  await expect(pageA.getByRole("heading", { name: `${title}新` })).toBeVisible();
  await pageB.getByTestId("save-poll").click();
  await expect(pageB.getByRole("alert")).toContainText("Refresh and try again");

  await pageA.goto(editUrl.replace(/\/edit$/, ""));
  const shareUrl = await publishCurrent(pageA);
  expect(shareUrl).toContain("/s/");
  expect(shareUrl).not.toContain(accessPassword);
  await pageA.goto(editUrl);
  await expect(pageA.getByRole("heading", { name: "Published polls cannot be edited" })).toBeVisible();
  await contextA.close();
  await contextB.close();
});
