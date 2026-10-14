import fs from "node:fs";
import { defineConfig } from "@playwright/test";

// E2E runs the built app. By default the agent loop runs in-process against the stand-in model;
// set E2E_BASE_URL to test an app you started yourself (for example with Docker Agent serving chat).
const external = process.env.E2E_BASE_URL;
const localChromium = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: external ?? "http://127.0.0.1:3100",
    launchOptions: fs.existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  webServer: external
    ? undefined
    : {
        command: "rm -rf .e2e-data && next start -p 3100",
        url: "http://127.0.0.1:3100",
        env: { LLM_PROVIDER: "mock", DATABASE_PATH: ".e2e-data/futureme.db", VAULT_DIR: ".e2e-data/vault" },
        reuseExistingServer: false,
      },
});
