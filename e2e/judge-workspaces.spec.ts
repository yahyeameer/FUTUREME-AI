import { expect, test, type Browser } from "@playwright/test";

// Multi-user mode only: run it against a server started with FUTUREME_MULTI_USER=1, FUTUREME_ACCESS_CODE and
// FUTUREME_SHOW_CODE=1, and set E2E_MULTI_USER=1 and E2E_BASE_URL (see docs/deploy.md).
test.skip(!process.env.E2E_MULTI_USER, "needs a multi-user server");

async function judge(browser: Browser, name: string, dream: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Use it" }).click();
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole("link", { name: /Explore my future/ }).first().click();
  await page.getByLabel("What should TOMORA call you?").fill(name);
  await page.getByLabel("Your ambition").fill(dream);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Values that guide you").fill("craft");
  await page.getByRole("button", { name: /Meet your future self/ }).click();
  await expect(page).toHaveURL(/\/reflection$/);
  return { context, page };
}

test("two judges each get a private future self", async ({ browser }) => {
  const a = await judge(browser, "Amina", "Lead a marine biology lab in Mombasa");
  const b = await judge(browser, "Yusuf", "Build solar mini-grids across Somaliland");

  for (const [who, other, { page }] of [["Amina", "Yusuf", a], ["Yusuf", "Amina", b]] as const) {
    await page.goto("/");
    await expect(page.getByText(new RegExp(`Good (morning|afternoon|evening), ${who}`))).toBeVisible();
    await expect(page.getByText(other)).toHaveCount(0);
  }

  // The workspace code from Settings opens the same future self in a brand-new browser.
  await a.page.goto("/settings");
  const code = await a.page.getByRole("textbox", { name: "Workspace code" }).inputValue();
  expect(code).toMatch(/^[a-f0-9]{32}$/);
  const back = await browser.newContext();
  const page = await back.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Use it" }).click();
  await page.getByText("Coming back? Use your workspace code").click();
  await page.getByPlaceholder(/32-character/).fill(code);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByText(/Good (morning|afternoon|evening), Amina/)).toBeVisible();

  await Promise.all([a.context.close(), b.context.close(), back.close()]);
});
