import { test, expect } from '@playwright/test';

const weatherFixtures = {
    KORD: { temperature: 21.1, altimeter: 29.7, windSpeed: 10, windDirection: 270, elevation: 663, lat: 41.9602, lon: -87.9316, variation: -3.96 },
    KARR: { temperature: 18.9, altimeter: 29.73, windSpeed: 13, windDirection: 300, elevation: 699, lat: 41.7713, lon: -88.4815, variation: -3.88 },
    KVYS: { temperature: 18, altimeter: 29.76, windSpeed: 10, windDirection: 270, elevation: 650, lat: 41.3519, lon: -89.1531, variation: -2.71 },
};

test.describe('OpenFlight AI - UI Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/weather/*', async (route) => {
            const url = new URL(route.request().url());
            const icao = url.pathname.split('/').pop().toUpperCase();
            const payload = weatherFixtures[icao];

            if (!payload) {
                await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Unknown ICAO in test fixture' }) });
                return;
            }

            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
        });

        await page.goto('http://localhost:3000');
    });

    test('should have dark theme colors', async ({ page }) => {
        const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(bodyBg).toBe('rgb(15, 23, 42)');
    });

    test('should have a detailed flight graph at the top', async ({ page }) => {
        await expect(page.locator('#flightGraph')).toBeVisible();
    });

    test('should populate departure weather when ICAO is entered', async ({ page }) => {
        const depInput = page.locator('#departure-icao');
        await depInput.fill('KORD');
        await depInput.blur();

        await expect(page.locator('#dep-temp')).toHaveValue('21.1');
        await expect(page.locator('#dep-altim')).toHaveValue('29.70');
        await expect(page.locator('#dep-lat')).toHaveValue('41.9602');
        await expect(page.locator('#dep-var')).toHaveValue('-3.96');
    });

    test('should assume K prefix when a 3-letter airport code is entered', async ({ page }) => {
        const depInput = page.locator('#departure-icao');
        await depInput.fill('ORD');
        await depInput.blur();

        await expect(depInput).toHaveValue('KORD');
        await expect(page.locator('#dep-lat')).toHaveValue('41.9602');
    });

    test('should add and remove destination legs', async ({ page }) => {
        await expect(page.locator('.dest-leg.destination')).toHaveCount(1);

        await page.click('text=+ ADD DESTINATION LEG');
        await expect(page.locator('.dest-leg.destination')).toHaveCount(2);

        await page.locator('.btn-remove').first().click();
        await expect(page.locator('.dest-leg.destination')).toHaveCount(1);
    });

    test('should let the user open and close the debug log', async ({ page }) => {
        const debugToggle = page.locator('#debug-toggle');
        const debugWindow = page.locator('#debug-window');

        await expect(debugWindow).toBeVisible();
        await expect(debugToggle).toHaveText('Hide Debug Log');
        await debugToggle.click();
        await expect(debugWindow).toBeHidden();
        await expect(debugToggle).toHaveText('Show Debug Log');
        await debugToggle.click();
        await expect(debugWindow).toBeVisible();
        await expect(debugToggle).toHaveText('Hide Debug Log');
    });

    test('should generate correct row counts for multiple destinations', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await expect(page.locator('#dep-lat')).toHaveValue('41.9602');

        await page.click('text=+ ADD DESTINATION LEG');

        const dests = page.locator('.destination-icao');
        await dests.nth(0).fill('KARR');
        await dests.nth(0).blur();
        await expect(page.locator('.leg-lat').nth(0)).toHaveValue('41.7713');

        await dests.nth(1).fill('KVYS');
        await dests.nth(1).blur();
        await expect(page.locator('.leg-lat').nth(1)).toHaveValue('41.3519');

        await page.fill('#cruise-alt', '4500');
        await page.click('text=GENERATE NAV LOG');

        await expect(page.locator('#nav-log-container')).toBeVisible();
        await expect(page.locator('#table1-body tr')).toHaveCount(4);
        await expect(page.locator('#table2-body tr')).toHaveCount(4);
        await expect(page.locator('#table3-body tr')).toHaveCount(2);
        await expect(page.locator('#table2-body tr').first().locator('td').nth(4)).toHaveText('-3.96');
    });
});
