/* playwright.config.ts */

import { defineConfig } from "@playwright/test";
import { config } from "./config.ts";

export default defineConfig({
  testDir: "./src",
  timeout: config.server.pauseBetweenClicks * 30, // Dynamic timeout based on config
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    headless: config.browser.headless,
    viewport: config.browser.viewport,
    ignoreHTTPSErrors: config.browser.ignoreHTTPSErrors,
    screenshot: config.browser.screenshot,
    video: config.browser.video,
    trace: config.browser.trace,
  },
});
