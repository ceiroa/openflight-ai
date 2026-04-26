import { test, expect } from '@playwright/test';

const weatherFixtures = {
    KORD: { temperature: 21.1, altimeter: 29.7, windSpeed: 10, windDirection: 270, elevation: 663, lat: 41.9602, lon: -87.9316, variation: -3.96 },
    KLOT: { temperature: 20, altimeter: 29.73, windSpeed: 12, windDirection: 250, elevation: 673, lat: 41.6031, lon: -88.1017, variation: -3.79 },
    KARR: { temperature: 18.9, altimeter: 29.73, windSpeed: 13, windDirection: 300, elevation: 699, lat: 41.7713, lon: -88.4815, variation: -3.88 },
    KSQI: { temperature: 17.4, altimeter: 29.78, windSpeed: 9, windDirection: 280, elevation: 654, lat: 41.7428, lon: -89.6762, variation: -2.94 },
    KVYS: { temperature: 18, altimeter: 29.76, windSpeed: 10, windDirection: 270, elevation: 650, lat: 41.3519, lon: -89.1531, variation: -2.71 },
};

const routeSignature = JSON.stringify({
    departure: { icao: 'KORD', lat: 41.9602, lon: -87.9316 },
    legs: [{ icao: 'KARR', lat: 41.7713, lon: -88.4815 }],
});

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

    test('should keep default cruise altitude at 3000', async ({ page }) => {
        await expect(page.locator('#cruise-alt')).toHaveValue('3000');
    });

    test('should reload weather when an airport field is edited and blurred again', async ({ page }) => {
        const depInput = page.locator('#departure-icao');
        await depInput.fill('KORD');
        await depInput.blur();
        await expect(page.locator('#dep-lat')).toHaveValue('41.9602');

        await depInput.fill('ARR');
        await depInput.blur();

        await expect(depInput).toHaveValue('KARR');
        await expect(page.locator('#dep-lat')).toHaveValue('41.7713');
        await expect(page.locator('#dep-weather-status')).toHaveText('Weather loaded for KARR.');
    });

    test('should show a loading message while airport weather is being fetched', async ({ page }) => {
        await page.unroute('**/api/weather/*');
        await page.route('**/api/weather/*', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 600));
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weatherFixtures.KORD) });
        });

        const depInput = page.locator('#departure-icao');
        await depInput.fill('KORD');
        await depInput.blur();

        await expect(page.locator('#dep-weather-status')).toHaveText('Loading weather for KORD...');
        await expect(page.locator('#dep-weather-status')).toHaveText('Weather loaded for KORD.');
    });

    test('should show incomplete weather errors in the airport status area', async ({ page }) => {
        await page.unroute('**/api/weather/*');
        await page.route('**/api/weather/*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ temperature: 21.1, altimeter: 29.7, windSpeed: 10, elevation: 663, lat: 41.9602 }),
            });
        });

        const depInput = page.locator('#departure-icao');
        await depInput.fill('KORD');
        await depInput.blur();

        await expect(page.locator('#dep-weather-status')).toHaveText('Weather data for KORD is missing lon.');
    });

    test('should assume K prefix when a 3-letter airport code is entered', async ({ page }) => {
        const depInput = page.locator('#departure-icao');
        await depInput.fill('ORD');
        await depInput.blur();

        await expect(depInput).toHaveValue('KORD');
        await expect(page.locator('#dep-lat')).toHaveValue('41.9602');
    });

    test('should show destination weather success in the destination status area', async ({ page }) => {
        const destinationInput = page.locator('.destination-icao').first();
        await destinationInput.fill('KARR');
        await destinationInput.blur();

        await expect(page.locator('.leg-weather-status').first()).toHaveText('Weather loaded for KARR.');
    });

    test('should populate the test route and reuse weather for duplicate airports', async ({ page }) => {
        let klotRequests = 0;
        await page.unroute('**/api/weather/*');
        await page.route('**/api/weather/*', async (route) => {
            const url = new URL(route.request().url());
            const icao = url.pathname.split('/').pop().toUpperCase();
            if (icao === 'KLOT') {
                klotRequests += 1;
            }
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weatherFixtures[icao]) });
        });

        await page.click('#test-fill-btn');

        await expect(page.locator('#departure-icao')).toHaveValue('KLOT');
        await expect(page.locator('.destination-icao').nth(0)).toHaveValue('KARR');
        await expect(page.locator('.destination-icao').nth(1)).toHaveValue('KSQI');
        await expect(page.locator('.destination-icao').nth(2)).toHaveValue('KLOT');
        await expect(page.locator('#dep-lat')).toHaveValue('41.6031');
        expect(klotRequests).toBe(1);
    });

    test('should add and remove destination legs', async ({ page }) => {
        await expect(page.locator('.dest-leg.destination')).toHaveCount(1);

        await page.click('text=+ ADD DESTINATION LEG');
        await expect(page.locator('.dest-leg.destination')).toHaveCount(2);

        await page.locator('.btn-remove').first().click();
        await expect(page.locator('.dest-leg.destination')).toHaveCount(1);
    });

    test('should open the checkpoints planner from the main page', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');

        await expect(page).toHaveURL(/checkpoints\.html$/);
        await expect(page.locator('h1')).toHaveText('Checkpoints Planner');
        await expect(page.locator('.leg-card')).toHaveCount(1);
    });

    test('should preserve nav-log draft data when returning from the checkpoints planner', async ({ page }) => {
        await page.fill('#departure-icao', 'KLOT');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await expect(page).toHaveURL(/checkpoints\.html$/);

        await page.click('#menu-toggle');
        await page.click('text=Back To Flight Setup');
        await expect(page).toHaveURL(/index\.html$/);
        await expect(page.locator('#departure-icao')).toHaveValue('KLOT');
        await expect(page.locator('.destination-icao').first()).toHaveValue('KARR');
        await expect(page.locator('#dep-lat')).toHaveValue('41.6031');
    });

    test('should let the user open and close the debug log', async ({ page }) => {
        const debugToggle = page.locator('#debug-toggle');
        const debugWindow = page.locator('#debug-window');

        await expect(debugWindow).toBeHidden();
        await expect(debugToggle).toHaveText('Show Debug Log');
        await debugToggle.click();
        await expect(debugWindow).toBeVisible();
        await expect(debugToggle).toHaveText('Hide Debug Log');
        await debugToggle.click();
        await expect(debugWindow).toBeHidden();
        await expect(debugToggle).toHaveText('Show Debug Log');
    });

    test('should populate table 3 from saved checkpoints when available', async ({ page }) => {
        await page.evaluate((plan) => {
            window.localStorage.setItem('openflight-ai-checkpoints', JSON.stringify(plan));
        }, {
            routeSignature,
            legs: [{
                checkpoints: [
                    { name: 'I-80 BRIDGE', distanceFromLegStartNm: 7.5, comms: 'VIS' },
                    { name: 'AURORA LAKE', distanceFromLegStartNm: 14.2, comms: '122.8' },
                ],
            }],
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('text=GENERATE NAV LOG');

        await expect(page.locator('#table3-body tr')).toHaveCount(3);
        await expect(page.locator('#table3-body tr').nth(0).locator('td').first()).toHaveText('I-80 BRIDGE');
        await expect(page.locator('#table3-body tr').nth(1).locator('td').first()).toHaveText('AURORA LAKE');
        await expect(page.locator('#table3-body tr').nth(2).locator('td').first()).toHaveText('KARR');
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
