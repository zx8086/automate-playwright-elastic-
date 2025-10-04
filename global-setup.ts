/* global-setup.ts */

import { chromium, type FullConfig } from "@playwright/test";

async function globalSetup(_config: FullConfig) {
  const browser = await chromium.launch();
  const _page = await browser.newPage();

  try {
    // Add any global setup logic here
    // For example, global authentication if needed:
    // await page.goto('https://example.com/login');
    // await page.fill('#username', Bun.env.USER_EMAIL);
    // await page.fill('#password', Bun.env.USER_PASSWORD);
    // await page.click('#submit');

    // Store authentication state if needed
    // await page.context().storageState({ path: 'auth.json' });

    console.log("Global setup completed successfully");
  } catch (error) {
    console.error("Global setup failed:", error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
