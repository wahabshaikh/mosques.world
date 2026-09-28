import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  // Phase suites share one database (preview or local), so they run one file at a time.
  workers: 1,
  retries: 0,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173", trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /phase-5\// },
    // "At the mosque" is a phone flow (spec P5 acceptance runs on WebKit mobile).
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] }, testMatch: /phase-5\// },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm exec wrangler d1 migrations apply DB --local && pnpm dev",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
