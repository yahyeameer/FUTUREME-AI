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

// Runs after the first test, on the same server: the agent team features, each through the real API.
test("fact check -> council -> night shift", async ({ page }) => {
  await page.goto("/future-self");
  // The reply from the first test gets checked against the vault by the verifier agent.
  await expect(page.getByRole("button", { name: /^Fact-checked:/ }).first()).toBeVisible({ timeout: 45_000 });

  await page.goto("/council");
  await page.getByPlaceholder("What decision are you weighing?").fill("Should I apply to the regional AI fellowship?");
  await page.getByRole("button", { name: "Convene the council" }).click();
  await expect(page.getByRole("heading", { name: "Decision brief" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: "What each voice said" }).getByRole("article")).toHaveCount(4);
  await page.getByRole("button", { name: "Save brief to vault" }).click();
  await expect(page.getByRole("link", { name: "Saved to your vault" })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "e2e/screenshots/council.png", fullPage: true });

  await page.goto("/agent");
  await expect(page.getByRole("heading", { name: "The team" })).toBeVisible();
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText("Morning brief", { exact: true })).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: "e2e/screenshots/agent.png", fullPage: true });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "While you slept" })).toBeVisible();
});
