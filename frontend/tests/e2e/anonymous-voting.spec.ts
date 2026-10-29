import { expect, test } from "@playwright/test";

import { createDraft, login, publishCurrent, register, uniqueName, voteFor } from "./support";

test("匿名同浏览器不能再投，另一个浏览器可以，丢响应后用原凭据找回", async ({ browser }) => {
  const creatorName = uniqueName("anonhost");
  const title = `Anon_${creatorName}`;
  const creatorContext = await browser.newContext();
  const first = await browser.newContext();
  const second = await browser.newContext();
  const creator = await creatorContext.newPage();
  const page = await first.newPage();
  const other = await second.newPage();

  await register(creator, creatorName, "Anon Host");
  await login(creator, creatorName);
  await createDraft(creator, { title, anonymous: true });
  const shareUrl = new URL(await publishCurrent(creator));

  await page.goto(`${shareUrl.pathname}`);
  await expect(page.getByText("not strictly one person, one vote")).toBeVisible();
  let lost = 0;
  await page.route("**/api/v1/polls/*/votes", async (route) => {
    const response = await route.fetch();
    lost += 1;
    if (lost === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: 50302,
          msg: "提交结果待确认，请查询本人参与状态",
          data: null,
          request_id: "lost-response",
        }),
      });
      return;
    }
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: await response.body(),
    });
  });
  await page.getByLabel("Option A").check();
  await expect(page.getByTestId("vote-submit")).toBeEnabled();
  await page.getByTestId("vote-submit").click();
  await page.getByTestId("vote-confirm").click();
  await expect(page.getByTestId("receipt")).toBeVisible();
  expect(lost).toBe(1);

  await page.reload();
  await expect(page.getByTestId("receipt")).toBeVisible();
  await other.goto(shareUrl.pathname);
  await voteFor(other, "Option B");
  await creatorContext.close();
  await first.close();
  await second.close();
});
