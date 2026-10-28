import { expect, test, type Page } from "@playwright/test";

import { accessPassword, createDraft, login, publishCurrent, register, uniqueName, voteFor } from "./support";

const choices = ["甲", "乙", "丙"];

async function openShare(page: Page, shareUrl: string): Promise<void> {
  await page.goto(new URL(shareUrl).pathname);
}

async function unlock(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Enter passcode" }).click();
  await page.getByLabel("Passcode", { exact: true }).fill(accessPassword);
  await page.getByRole("button", { name: "Unlock" }).click();
}

test("四种身份和公开性的单选、多选都只产生一份回执", async ({ browser }) => {
  test.setTimeout(240_000);
  const creatorName = uniqueName("combo");
  const voterName = uniqueName("comber");
  const creatorContext = await browser.newContext();
  const namedContext = await browser.newContext();
  const anonContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const named = await namedContext.newPage();
  const anon = await anonContext.newPage();

  await register(creator, creatorName, "组合创建者");
  await login(creator, creatorName);
  await register(named, voterName, "组合参与者");
  await login(named, voterName);

  const cases = [
    { anonymous: false, visibility: "PUBLIC" as const, multiple: false },
    { anonymous: false, visibility: "PUBLIC" as const, multiple: true },
    { anonymous: false, visibility: "PRIVATE" as const, multiple: false },
    { anonymous: false, visibility: "PRIVATE" as const, multiple: true },
    { anonymous: true, visibility: "PUBLIC" as const, multiple: false },
    { anonymous: true, visibility: "PUBLIC" as const, multiple: true },
    { anonymous: true, visibility: "PRIVATE" as const, multiple: false },
    { anonymous: true, visibility: "PRIVATE" as const, multiple: true },
  ];

  for (const [index, item] of cases.entries()) {
    const title = `${item.anonymous ? "匿" : "名"}${item.visibility === "PRIVATE" ? "私" : "公"}${item.multiple ? "多" : "单"}${creatorName}${index}`;
    await createDraft(creator, {
      title,
      anonymous: item.anonymous,
      visibility: item.visibility,
      password: item.visibility === "PRIVATE" ? accessPassword : undefined,
      options: item.multiple ? choices : ["甲", "乙"],
      multiple: item.multiple,
    });
    const shareUrl = await publishCurrent(creator);
    const voter = item.anonymous ? anon : named;
    await openShare(voter, shareUrl);
    if (item.visibility === "PRIVATE") {
      await unlock(voter);
    }
    await expect(voter.getByRole("heading", { name: title })).toBeVisible();
    await voteFor(voter, item.multiple ? ["甲", "丙"] : "甲");
    await expect(voter.getByTestId("vote-submit")).toHaveCount(0);
  }

  await creatorContext.close();
  await namedContext.close();
  await anonContext.close();
});

test("上限两份时第二份关闭，第三份被拒绝，份数和选择次数不同", async ({ browser }) => {
  test.setTimeout(120_000);
  const creatorName = uniqueName("cap");
  const title = `上限${creatorName}`;
  const creatorContext = await browser.newContext();
  const contexts = [await browser.newContext(), await browser.newContext(), await browser.newContext()];
  const creator = await creatorContext.newPage();
  const [first, second, third] = [await contexts[0].newPage(), await contexts[1].newPage(), await contexts[2].newPage()];

  await register(creator, creatorName, "上限创建者");
  await login(creator, creatorName);
  await createDraft(creator, {
    title,
    anonymous: true,
    options: choices,
    multiple: true,
    voteLimit: 2,
  });
  const shareUrl = await publishCurrent(creator);
  for (const page of [first, second, third]) {
    await openShare(page, shareUrl);
    await expect(page.getByRole("checkbox", { name: "甲", exact: true })).toBeVisible();
  }

  await voteFor(first, ["甲", "丙"]);
  await voteFor(second, "乙");
  await third.getByRole("checkbox", { name: "甲", exact: true }).check();
  await third.getByTestId("vote-submit").click();
  await third.getByTestId("vote-confirm").click();
  await expect(third.getByText("This poll has ended. You cannot vote.")).toBeVisible();
  await expect(third.getByTestId("vote-submit")).toHaveCount(0);
  await expect(third.getByTestId("receipt")).toHaveCount(0);

  await creator.reload();
  const results = creator.getByTestId("results");
  await expect(results).toContainText("Ballots 2");
  await expect(results).toContainText("Selections 3");
  await expect(results).toContainText("Final results");

  await creatorContext.close();
  await Promise.all(contexts.map((context) => context.close()));
});
