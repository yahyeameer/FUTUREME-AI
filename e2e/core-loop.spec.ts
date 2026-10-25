import { expect, test } from "@playwright/test";

// Runs against the TOMORA server (stand-in model by default), so every step goes through the real API routes.
test("onboarding -> reflection -> chat with memory -> approve plan -> complete task -> daily", async ({ page }) => {
  // Someone new lands on the TOMORA welcome page; its primary CTA leads into onboarding.
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 1, name: "Tomorrow starts with you." })).toBeVisible();
  await page.getByRole("link", { name: /Explore my future/ }).first().click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("What should TOMORA call you?").fill("Amina");
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
  await expect(page.getByRole("heading", { name: /TOMORA Daily/ })).toBeVisible();
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

// Handoffs, the supervisor and a mission, on the same server.
test("handoff to a helper -> supervisor -> mission", async ({ page }) => {
  await page.goto("/future-self");
  await page.getByPlaceholder("Tell your future self what's on your mind…").fill("Compare a part-time master's with a bootcamp for me");
  await page.getByRole("button", { name: "Send" }).click();
  const handoffs = page.getByLabel("Handed off");
  await expect(handoffs).toBeVisible({ timeout: 60_000 });
  await expect(handoffs.getByRole("button", { name: /Analyst helper/ })).toBeVisible();
  await expect(handoffs.getByText("Supervisor: OK")).toBeVisible();

  await page.goto("/missions");
  await page.getByLabel("Mission goal").fill("Get my first paper accepted at a workshop");
  await page.getByRole("button", { name: "Start the mission" }).click();
  await expect(page.getByRole("heading", { name: "Report" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/3 of 3 tasks came back/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Approve and create" })).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/missions.png", fullPage: true });

  await page.goto("/agent");
  const log = page.getByRole("region", { name: "Supervisor" });
  await expect(log.getByRole("button", { name: /Created: Analyst helper/ })).toBeVisible();
  await expect(log.getByRole("button", { name: /Mission task/ })).toHaveCount(3);
});

// The public welcome page: every link lands somewhere real, the preview works by keyboard, and phones don't scroll
// sideways. Runs last, after onboarding above, so a profile exists and "Explore my future" opens the app itself.
test("welcome page: links, keyboard preview, phone layout and brand assets", async ({ page, request }) => {
  await page.goto("/welcome");
  await expect(page).toHaveTitle("TOMORA: Tomorrow starts with you.");

  // Every in-page link points at a section that exists.
  const anchors = await page.locator('a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  expect(anchors.length).toBeGreaterThan(5);
  for (const href of new Set(anchors)) await expect(page.locator(href)).toHaveCount(1);

  // The branching preview's tabs move with the arrow keys.
  const tabs = page.getByRole("tab");
  await tabs.nth(1).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("University-focused route");

  // The what-if is plain arithmetic: 6 hours a week instead of 12 doubles the example road's 1–2 years.
  await page.getByLabel("Hours a week you can give").fill("6");
  await expect(page.locator("#futures").getByText("2–4 years")).toBeVisible();

  // With a profile, the primary CTA goes into the app (through /start, which waits for the workspace).
  await page.getByRole("link", { name: /Explore my future/ }).first().click();
  await expect(page).toHaveURL(/\/$/);

  // Phone: no sideways scroll, and the menu opens and links work.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/welcome");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.locator("#mobile-sections").getByRole("link", { name: "FAQ" }).click();
  await expect(page.getByRole("heading", { name: "Frequently asked questions." })).toBeInViewport();

  for (const path of ["/icon.svg", "/apple-icon", "/manifest.webmanifest", "/opengraph-image"]) expect((await request.get(path)).ok()).toBe(true);
  expect(await (await request.get("/manifest.webmanifest")).json()).toMatchObject({ short_name: "TOMORA" });
});
