import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const origin = "http://localhost:5173";
export const accountPassword = "password-ada-1";
export const accessPassword = "access-pass1";
export const adminPassword = process.env.DEMO_ADMIN_PASSWORD ?? "comp8500sefgroup60";

export function uniqueName(prefix: string): string {
  const raw = `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32);
}

export async function guestToken(page: Page): Promise<string> {
  let value = "";
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      value = cookies.find((item) => item.name === "voting_guest")?.value ?? "";
      return value;
    })
    .not.toBe("");
  return value;
}

async function fillField(page: Page, label: string, value: string, exact = false): Promise<void> {
  const field = page.getByLabel(label, { exact });
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value);
  }).toPass();
}

export async function register(
  page: Page,
  username: string,
  displayName: string,
  options?: { stay?: boolean },
): Promise<void> {
  if (!options?.stay) {
    await page.goto("/register");
  }
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await fillField(page, "Username", username);
  await fillField(page, "Display name", displayName);
  await fillField(page, "Password", accountPassword, true);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/login/);
}

export async function login(page: Page, username: string, password = accountPassword): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator(".topbar-user-trigger")).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.locator(".topbar-user-trigger").click();
  await page.getByRole("button", { name: "Log out" }).click();
}

export async function createDraft(
  page: Page,
  options: {
    title: string;
    anonymous?: boolean;
    visibility?: "PUBLIC" | "PRIVATE";
    password?: string;
    options?: string[];
    multiple?: boolean;
    voteLimit?: number;
  },
): Promise<void> {
  await page.goto("/my-polls/new");
  await page.getByLabel("Title").fill(options.title);
  const labels = options.options ?? ["甲", "乙"];
  await page.getByRole("textbox", { name: "Option 1", exact: true }).fill(labels[0] ?? "甲");
  await page.getByRole("textbox", { name: "Option 2", exact: true }).fill(labels[1] ?? "乙");
  for (let index = 2; index < labels.length; index += 1) {
    await page.getByRole("button", { name: /Add option/ }).click();
    await page.getByRole("textbox", { name: `Option ${index + 1}`, exact: true }).fill(labels[index] ?? "");
  }
  if (options.multiple) {
    await page.getByRole("radio", { name: "Multiple choice" }).check();
  }
  if (options.voteLimit !== undefined) {
    const limit = page.getByRole("textbox", { name: "Ballot limit", exact: true });
    await limit.fill(String(options.voteLimit));
    await limit.blur();
  }
  if (options.anonymous) {
    await page.getByRole("switch", { name: "Anonymous voting" }).check();
  }
  if (options.visibility === "PRIVATE") {
    await page.getByRole("switch", { name: "Private poll" }).check();
    await page.getByTestId("access-password").fill(options.password ?? accessPassword);
  }
  await page.getByTestId("save-poll").click();
  await expect(page.getByRole("heading", { name: options.title })).toBeVisible();
}

export async function publishCurrent(page: Page): Promise<string> {
  await page.getByTestId("publish").click();
  const share = page.getByTestId("share-url");
  await expect(share).toBeVisible();
  return share.inputValue();
}

export async function voteFor(page: Page, label: string | string[]): Promise<void> {
  const labels = Array.isArray(label) ? label : [label];
  const multiple = await page.getByText("Choose one or more options").isVisible();
  const role = multiple ? "checkbox" : "radio";
  for (const item of labels) {
    await page.getByRole(role, { name: item, exact: true }).check();
  }
  const submit = page.getByTestId("vote-submit");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toHaveText(labels);
  await page.getByTestId("vote-confirm").click();
  await expect(page.getByTestId("receipt")).toBeVisible();
}

export async function apiPost(
  request: APIRequestContext,
  path: string,
  data: unknown,
  csrf?: string,
): Promise<Awaited<ReturnType<APIRequestContext["post"]>>> {
  const headers: Record<string, string> = { Origin: origin };
  if (csrf) {
    headers["X-CSRF-Token"] = csrf;
  }
  return request.post(path, { data: { data }, headers });
}
