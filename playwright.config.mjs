import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const windowsChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? (!process.env.CI && process.platform === "win32" && existsSync(windowsChrome) ? windowsChrome : undefined);
const launchOptions = executablePath
  ? { executablePath }
  : undefined;

export default defineConfig({
  testDir: "./tests",
  globalTeardown: "./tests/global-teardown.mjs",
  fullyParallel: true,
  timeout: 45_000,
  workers: process.env.CI ? 2 : 4,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["line"]] : "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    launchOptions,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "node scripts/serve-dist.mjs --root=dist --port=4173",
      env: { ...process.env, PORTFOLIO_TEST_TOKEN: "portfolio-playwright-server" },
      url: "http://127.0.0.1:4173/",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      command: "node scripts/serve-dist.mjs --root=source --port=4174",
      env: { ...process.env, PORTFOLIO_TEST_TOKEN: "portfolio-playwright-server" },
      url: "http://127.0.0.1:4174/",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    }
  ],
  projects: [
    {
      name: "chromium-desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } }
    },
    {
      name: "chromium-mobile-320",
      use: {
        browserName: "chromium",
        hasTouch: true,
        isMobile: true,
        viewport: { width: 320, height: 800 }
      }
    }
  ]
});
