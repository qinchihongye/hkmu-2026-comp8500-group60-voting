import { expect, test } from "@playwright/test";

import { accessPassword, accountPassword, createDraft, login, publishCurrent, register, uniqueName, voteFor } from "./support";

test("私密记名先要密码再要登录，地址里不出现密码", async ({ browser }) => {
  const creatorName = uniqueName("priv");
  const voterName = uniqueName("guest");
  const title = `私密${creatorName}`;
  const creatorContext = await browser.newContext();
  const voterContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const voter = await voterContext.newPage();

  await register(creator, creatorName, "私密创建者");
  await login(creator, creatorName);
  await createDraft(creator, { title, visibility: "PRIVATE", password: accessPassword });
  const shareUrl = new URL(await publishCurrent(creator));
  expect(shareUrl.search).not.toContain(accessPassword);

  await voter.goto(shareUrl.pathname);
  await expect(voter.getByRole("heading", { name: "Passcode required" })).toBeVisible();
  await expect(voter.getByText(title)).toHaveCount(0);
  await voter.getByLabel("Passcode", { exact: true }).fill("wrong-pass-1");
  await voter.getByRole("button", { name: "Unlock" }).click();
  await expect(voter.getByRole("alert")).toContainText("The passcode is incorrect");
  expect(voter.url()).not.toContain(accessPassword);
  await voter.getByLabel("Passcode", { exact: true }).fill(accessPassword);
  await voter.getByRole("button", { name: "Unlock" }).click();
  await expect(voter.getByRole("heading", { name: "Sign in required" })).toBeVisible();
  await voter.getByRole("link", { name: "Sign in and return" }).click();
  await expect(voter).toHaveURL(/\/login\?next=/);
  await voter.getByRole("link", { name: "Sign up" }).click();
  await expect(voter).toHaveURL(/\/register\?next=/);
  await register(voter, voterName, "私密参与者", { stay: true });
  await voter.getByLabel("Username").fill(voterName);
  await voter.getByLabel("Password", { exact: true }).fill(accountPassword);
  await voter.getByRole("button", { name: "Log in" }).click();
  await expect(voter.getByRole("heading", { name: title })).toBeVisible();
  await voteFor(voter, "乙");
  await creatorContext.close();
  await voterContext.close();
});
