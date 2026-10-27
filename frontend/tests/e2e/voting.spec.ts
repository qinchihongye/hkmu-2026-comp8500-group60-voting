import { expect, test } from "@playwright/test";

import { createDraft, login, publishCurrent, register, uniqueName, voteFor } from "./support";

test("记名公开投票每账户一票，进行中结果只给创建者", async ({ browser }) => {
  const creatorName = uniqueName("host");
  const voterName = uniqueName("voter");
  const title = `记名${creatorName}`;
  const creatorContext = await browser.newContext();
  const voterContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const voter = await voterContext.newPage();

  await register(creator, creatorName, "主持人");
  await login(creator, creatorName);
  await createDraft(creator, { title });
  await publishCurrent(creator);
  await expect(creator.getByTestId("results")).toContainText("Current lead");

  await register(voter, voterName, "参与者");
  await login(voter, voterName);
  await voter.goto("/public-polls");
  await voter.getByRole("link", { name: title }).click();
  await voteFor(voter, "甲");
  await voter.reload();
  await expect(voter.getByTestId("receipt")).toBeVisible();
  await expect(voter.getByTestId("vote-submit")).toHaveCount(0);
  const sameBrowser = await voterContext.newPage();
  await sameBrowser.goto(voter.url());
  await expect(sameBrowser.getByTestId("receipt")).toBeVisible();
  await expect(sameBrowser.getByTestId("vote-submit")).toHaveCount(0);
  await voter.goto(`${voter.url().split("?")[0]}/results`);
  await expect(voter.getByRole("heading", { name: "Results are not available yet" })).toBeVisible();

  await creator.reload();
  await expect(creator.getByTestId("results")).toContainText("甲");
  await creatorContext.close();
  await voterContext.close();
});
