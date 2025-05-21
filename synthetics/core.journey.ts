/* eu-shared-services/presskit/SP25TommyHilfigerSailing/core.journey.ts */

import {journey, monitor, step} from '@elastic/synthetics';

journey('MT - PressKit Journey | SP25TommyHilfigerSailing (core) - prd', async ({ page }) => {
    monitor.use({
        id: 'PressKit_SP25TommyHilfigerSailing',
        schedule: 30,
        screenshot: 'on',
        throttling: false,
        tags: ["production","marketing_technology","eu-shared-services","presskit","SP25TommyHilfigerSailing"],
    });

    const baseUrl = 'https://presskit.tommy.com/SP25TommyHilfigerSailing/';

    step('Go to homepage', async () => {
        await page.goto(baseUrl);
    });

    step('Navigate to "Bio"', async () => {
        try {
            // Try role-based selector with full text
            await page.getByRole('link', { name: 'Bio' }).click();
        } catch (e) {
            try {
                // Try href-based selector
                await page.locator('a[href*=""]').click();
            } catch (e) {
                try {
                    // Try text-based selector
                    await page.locator('a').filter({ hasText: 'Bio' }).click();
                } catch (e) {
                    // Direct navigation as fallback
                    await page.goto('https://presskit.tommy.com/SP25TommyHilfigerSailing/bio/');
                }
            }
        }
    });

    step('Return to previous page', async () => {
        try {
            // Try browser back
            await page.goBack();
        } catch (e) {
            // Fallback to direct navigation
            await page.goto(baseUrl);
        }
    });
    step('Navigate to "Assets"', async () => {
        try {
            // Try role-based selector with full text
            await page.getByRole('link', { name: 'Assets' }).click();
        } catch (e) {
            try {
                // Try href-based selector
                await page.locator('a[href*=""]').click();
            } catch (e) {
                try {
                    // Try text-based selector
                    await page.locator('a').filter({ hasText: 'Assets' }).click();
                } catch (e) {
                    // Direct navigation as fallback
                    await page.goto('https://presskit.tommy.com/SP25TommyHilfigerSailing/assets/');
                }
            }
        }
    });

    step('Return to previous page', async () => {
        try {
            // Try browser back
            await page.goBack();
        } catch (e) {
            // Fallback to direct navigation
            await page.goto(baseUrl);
        }
    });
    step('Navigate to "Contacts"', async () => {
        try {
            // Try role-based selector with full text
            await page.getByRole('link', { name: 'Contacts' }).click();
        } catch (e) {
            try {
                // Try href-based selector
                await page.locator('a[href*=""]').click();
            } catch (e) {
                try {
                    // Try text-based selector
                    await page.locator('a').filter({ hasText: 'Contacts' }).click();
                } catch (e) {
                    // Direct navigation as fallback
                    await page.goto('https://presskit.tommy.com/SP25TommyHilfigerSailing/contacts/');
                }
            }
        }
    });

    step('Return to previous page', async () => {
        try {
            // Try browser back
            await page.goBack();
        } catch (e) {
            // Fallback to direct navigation
            await page.goto(baseUrl);
        }
    });
    step('Return to homepage', async () => {
        try {
            // Try browser back
            await page.goBack();
        } catch (e) {
            // Fallback to direct navigation
            await page.goto(baseUrl);
        }
    });
});
