import { defineConfig, devices } from "@playwright/test";

const ci = Boolean(process.env.CI);
// CI (and E2E_BUILD=1) tests the production build in workerd via `vite preview`: the dev server serves hundreds of
// unbundled modules, which the service worker's bounded caches (and offline tests) aren't built for.
const build = ci || process.env.E2E_BUILD === "1";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  // Phase suites share one database (preview or local), so they run one file at a time.
  workers: 1,
  retries: 0,
  forbidOnly: ci,
  reporter: ci ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    // Area fill answers from an in-app fixture instead of Overpass and Photon (non-production hosts only).
    storageState: { cookies: [{ name: "mw_osm_fixture", value: "1", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] },
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Sandboxes that ship their own Chromium (and can't run `playwright install`) point at it here.
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined } },
      testIgnore: /phase-5\//,
    },
    // "At the mosque" is a phone flow (spec P5 acceptance runs on WebKit mobile).
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] }, testMatch: /phase-5\//, grepInvert: /@chromium-phone/ },
    // Phone-sized Chromium for phase-5 tests WebKit can't drive under Playwright (tagged @chromium-phone).
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined } },
      testMatch: /phase-5\//,
      grep: /@chromium-phone/,
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: build
          ? "pnpm db:migrate:local && pnpm build && pnpm exec vite preview --port 5173 --host 127.0.0.1 --strictPort"
          : "pnpm db:migrate:local && pnpm dev",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !ci,
        timeout: 300_000,
      },
});
