import { expect, test } from "@playwright/test";

// Runs against the FutureMe server (stand-in model by default), so every step goes through the real API routes.
test("onboarding -> reflection -> chat with memory -> approve plan -> complete task -> daily", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("What should FutureMe call you?").fill("Amina");
  await page.getByLabel("Your ambition").fill("Lead an AI research lab in Hargeisa");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Values that guide you").fill("family, craft, courage");
  await page.getByRole("button", { name: /Meet your future self/ }).click();

  await expect(page).toHaveURL(/\/reflection$/);
  await page.getByRole("button", { name: /Begin the reflection/ }).click();
  await expect(page.getByRole("button", { name: /^Begin/ })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "e2e/screenshots/reflection.png", fullPage: true });

  await page.goto("/future-self");
  await page.getByPlaceholder("Tell your future self what's on your mind…").fill("Help me plan my first research project");
  await page.getByRole("button", { name: "Send" }).click();
  // An agent turn includes tool calls (through Docker Agent when it serves chat), so allow it more time.
  const approve = page.getByRole("button", { name: "Approve and create" });
  await expect(approve).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: "e2e/screenshots/chat.png", fullPage: true });

  await approve.click();
  await expect(page.getByRole("status").filter({ hasText: /Created “.+” with 3 tasks/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Open in roadmap" }).click();

  await expect(page).toHaveURL(/\/roadmap/);
  await expect(page.getByText("0/3 tasks")).toBeVisible();
  await page.getByRole("checkbox", { name: /^Mark “.+” as done$/ }).first().click();
  await expect(page.getByText("1/3 tasks")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/roadmap.png", fullPage: true });

  await page.goto("/daily");
  await expect(page.getByRole("heading", { name: /FutureMe Daily/ })).toBeVisible();
  await page.getByRole("button", { name: /Publish (today's|the first) edition/ }).first().click();
  await expect(page.getByRole("heading", { name: /Amina completes 1 step/ })).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: "e2e/screenshots/daily.png", fullPage: true });
});
