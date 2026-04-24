import { test, expect } from '@playwright/test';

test.describe('OpenFlight AI - UI Tests', () => {
    
    test.beforeEach(async ({ page }) => {
        // Assume server is running on localhost:3000
        await page.goto('http://localhost:3000');
    });

    test('should have dark theme colors', async ({ page }) => {
        const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        // rgb(15, 23, 42) is #0f172a
        expect(bodyBg).toBe('rgb(15, 23, 42)');
    });

    test('should have a detailed flight graph at the top', async ({ page }) => {
        const canvas = page.locator('#flightGraph');
        await expect(canvas).toBeVisible();
    });

    test('should populate departure weather when ICAO is entered', async ({ page }) => {
        const depInput = page.locator('#departure-icao');
        await depInput.fill('KORD');
        await depInput.blur();
        
        // Wait for weather fetch and population
        const tempField = page.locator('#dep-temp');
        await expect(tempField).not.toHaveValue('', { timeout: 10000 });
        
        const altimField = page.locator('#dep-altim');
        await expect(altimField).not.toHaveValue('');
    });

    test('should add and remove destination legs', async ({ page }) => {
        const initialLegs = await page.locator('.dest-leg.destination').count();
        expect(initialLegs).toBe(1);

        await page.click('text=+ ADD DESTINATION LEG');
        await expect(page.locator('.dest-leg.destination')).toHaveCount(2);

        await page.locator('.btn-remove').first().click();
        await expect(page.locator('.dest-leg.destination')).toHaveCount(1);
    });

    test('should generate navigation log tables', async ({ page }) => {
        // Fill basic info
        await page.fill('#departure-icao', 'KORD');
        await page.fill('.destination-icao', 'KSFO');
        await page.fill('.leg-planned-alt', '4500');
        
        // Trigger blur to ensure data loads
        await page.locator('.destination-icao').blur();
        
        // Click generate
        await page.click('text=GENERATE NAV LOG');

        // Check if log container is visible
        const logContainer = page.locator('#nav-log-container');
        await expect(logContainer).toBeVisible();

        // Verify tables have content
        const table1Rows = await page.locator('#table1-body tr').count();
        expect(table1Rows).toBeGreaterThan(0);
        
        const table2Rows = await page.locator('#table2-body tr').count();
        expect(table2Rows).toBeGreaterThan(0);
    });
});
