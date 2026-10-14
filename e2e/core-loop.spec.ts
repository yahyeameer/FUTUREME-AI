import { expect, test } from "@playwright/test";

test("onboarding -> future letter -> chat with memory -> approve plan -> complete task", async ({ page }) => {
  await page.goto("/onboarding");
  await page.getByLabel("Your name").fill("Amina");
  await page.getByLabel("Your 10-year dream").fill("Lead an AI research lab in Hargeisa");
  await page.getByLabel("Your values").fill("family, craft, courage");
  await page.getByRole("button", { name: /future/i }).click();

  await expect(page).toHaveURL(/\/future$/);
  await page.getByRole("button", { name: /read a letter/i }).click();
  await expect(page.getByText(/ten years from now, Amina/)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "e2e/screenshots/future.png", fullPage: true });

  await page.getByRole("link", { name: "Talk to them" }).click();
  await page.getByPlaceholder("Talk to your future self…").fill("Help me plan my first research project");
  await page.getByRole("button", { name: "Send" }).click();
  // An agent turn includes tool calls (through Docker Agent when it serves chat), so allow it more time.
  await expect(page.getByText(/remembered Profile\//).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("link", { name: /1 proposal waiting/ })).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/chat.png", fullPage: true });

  await page.getByRole("link", { name: /1 proposal waiting/ }).click();
  await expect(page.getByText("Proposed plan")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("heading", { name: "My first research project" })).toBeVisible();
  await expect(page.getByText("0/3 done")).toBeVisible();

  await page.getByRole("button", { name: "Mark done" }).first().click();
  await expect(page.getByText("1/3 done")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/plan.png", fullPage: true });
});
