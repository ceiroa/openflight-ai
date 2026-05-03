import { test, expect } from '@playwright/test';

const weatherFixtures = {
    KORD: { temperature: 21.1, altimeter: 29.7, windSpeed: 10, windDirection: 270, elevation: 663, lat: 41.9602, lon: -87.9316, variation: -3.96, visibilitySm: 10, ceilingFt: 4500, cloudSummary: 'SCT 3,000 ft, BKN 4,500 ft', cloudLayers: [{ cover: 'SCT', baseFt: 3000 }, { cover: 'BKN', baseFt: 4500 }], presentWeather: ['-RA'], hazards: { precipitation: true, thunderstorm: false }, flightCategory: 'VFR' },
    KLOT: { temperature: 20, altimeter: 29.73, windSpeed: 12, windDirection: 250, elevation: 673, lat: 41.6031, lon: -88.1017, variation: -3.79, visibilitySm: 5, ceilingFt: 2800, cloudSummary: 'BKN 2,800 ft', cloudLayers: [{ cover: 'BKN', baseFt: 2800 }], presentWeather: ['BR'], hazards: { precipitation: false, thunderstorm: false }, flightCategory: 'MVFR' },
    KARR: { temperature: 18.9, altimeter: 29.73, windSpeed: 13, windDirection: 300, elevation: 699, lat: 41.7713, lon: -88.4815, variation: -3.88, visibilitySm: 2.5, ceilingFt: 900, cloudSummary: 'OVC 900 ft', cloudLayers: [{ cover: 'OVC', baseFt: 900 }], presentWeather: ['TSRA'], hazards: { precipitation: true, thunderstorm: true }, flightCategory: 'IFR' },
    KSQI: { temperature: 17.4, altimeter: 29.78, windSpeed: 9, windDirection: 280, elevation: 654, lat: 41.7428, lon: -89.6762, variation: -2.94, visibilitySm: 6, ceilingFt: 3500, cloudSummary: 'BKN 3,500 ft', cloudLayers: [{ cover: 'BKN', baseFt: 3500 }], presentWeather: [], hazards: { precipitation: false, thunderstorm: false }, flightCategory: 'VFR' },
    KVYS: { temperature: 18, altimeter: 29.76, windSpeed: 10, windDirection: 270, elevation: 650, lat: 41.3519, lon: -89.1531, variation: -2.71, visibilitySm: 7, ceilingFt: null, cloudSummary: 'Clear', cloudLayers: [], presentWeather: [], hazards: { precipitation: false, thunderstorm: false }, flightCategory: 'VFR' },
    K1C5: { temperature: 16.8, altimeter: 29.82, windSpeed: 8, windDirection: 240, elevation: 640, lat: 41.7584, lon: -88.4757, variation: -3.88, visibilitySm: 6, ceilingFt: 3200, cloudSummary: 'BKN 3,200 ft', cloudLayers: [{ cover: 'BKN', baseFt: 3200 }], presentWeather: [], hazards: { precipitation: false, thunderstorm: false }, flightCategory: 'VFR' },
};

const routeSignature = JSON.stringify({
    departure: { icao: 'KORD', lat: 41.9602, lon: -87.9316 },
    legs: [{ icao: 'KARR', lat: 41.7713, lon: -88.4815 }],
});

const airportCommsFixtures = {
    KORD: { summary: 'ATIS 135.4 | TWR 120.75' },
    KLOT: { summary: 'AWOS 118.125 | CTAF 123.0' },
    KARR: { summary: 'AWOS 118.525 | CTAF 120.1' },
    KSQI: { summary: 'AWOS 119.275 | CTAF 122.8' },
    KVYS: { summary: 'AWOS 118.525 | CTAF 122.8' },
};

test.describe('CieloRumbo - UI Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/api/weather/area*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    items: [
                        {
                            icao: 'KDPA',
                            name: 'DuPage Airport',
                            lat: 41.9078,
                            lon: -88.2486,
                            weather: {
                                temperature: 19.4,
                                altimeter: 29.74,
                                windSpeed: 11,
                                windDirection: 290,
                                elevation: 759,
                                lat: 41.9078,
                                lon: -88.2486,
                                variation: -3.8,
                                visibilitySm: 1.5,
                                ceilingFt: 700,
                                cloudSummary: 'OVC 700 ft',
                                cloudLayers: [{ cover: 'OVC', baseFt: 700 }],
                                presentWeather: ['RA'],
                                hazards: { precipitation: true, thunderstorm: false },
                                flightCategory: 'IFR',
                            },
                        },
                    ],
                    totalStationsInBounds: 1,
                    returnedStations: 1,
                    truncated: false,
                }),
            });
        });

        await page.route('**/api/weather/*', async (route) => {
            const url = new URL(route.request().url());
            if (url.pathname.endsWith('/area')) {
                await route.fallback();
                return;
            }
            const icao = url.pathname.split('/').pop().toUpperCase();
            const payload = weatherFixtures[icao];

            if (!payload) {
                await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Unknown ICAO in test fixture' }) });
                return;
            }

            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
        });

        await page.route('**/api/airport/*/comms', async (route) => {
            const url = new URL(route.request().url());
            const parts = url.pathname.split('/');
            const icao = parts[parts.length - 2].toUpperCase();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(airportCommsFixtures[icao] || { summary: 'N/A' }),
            });
        });

        await page.route('**/api/airspace*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    type: 'FeatureCollection',
                    features: [
                        {
                            type: 'Feature',
                            geometry: {
                                type: 'Polygon',
                                coordinates: [[
                                    [-88.2, 41.7],
                                    [-87.8, 41.7],
                                    [-87.8, 42.0],
                                    [-88.2, 42.0],
                                    [-88.2, 41.7],
                                ]],
                            },
                            properties: {
                                name: 'Chicago Class B',
                                class: 'B',
                                typeCode: 'CLASS',
                                lowerDesc: 'SFC',
                                lowerVal: 0,
                                lowerUom: 'FT',
                                lowerCode: 'SFC',
                                upperDesc: '10000 MSL',
                                upperVal: 10000,
                                upperUom: 'FT',
                                upperCode: 'MSL',
                                icaoId: 'KORD',
                                commName: 'Chicago',
                                sector: 'MAIN',
                            },
                        },
                    ],
                }),
            });
        });

        await page.route('**/api/elevation-profile', async (route) => {
            const body = route.request().postDataJSON();
            const points = Array.isArray(body?.points) ? body.points : [];
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    points: points.map((point, index) => ({
                        lat: point.lat,
                        lon: point.lon,
                        elevationFt: 650 + index * 3,
                    })),
                }),
            });
        });

        await page.route('**/api/checkpoints/generate*', async (route) => {
            const url = new URL(route.request().url());
            const mode = url.searchParams.get('mode') || 'enhanced';
            const draft = route.request().postDataJSON();
            const legs = draft.legs.map((leg, index) => ({
                legIndex: index,
                fromIcao: index === 0 ? draft.departure.icao : draft.legs[index - 1].icao,
                toIcao: leg.icao,
                legDistanceNm: 20,
                spacingNm: 6.7,
                checkpoints: [
                    {
                        name: mode === 'enhanced' ? `${leg.icao} VISUAL CHECKPOINT` : `${leg.icao} CHECKPOINT`,
                        distanceFromLegStartNm: 7,
                        comms: airportCommsFixtures[leg.icao]?.summary || 'VIS',
                        type: mode === 'enhanced' ? 'visual_checkpoint' : undefined,
                        source: mode === 'enhanced' ? 'chart_candidate' : undefined,
                    },
                ],
            }));

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ routeSignature, mode, legs }),
            });
        });

        await page.goto('/');
    });

    test('should have dark theme colors', async ({ page }) => {
        const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(bodyBg).toBe('rgb(15, 23, 42)');
    });

    test('should have a detailed flight graph at the top', async ({ page }) => {
        await expect(page.locator('#flightGraph')).toBeVisible();
    });

    test('should show the educational-use disclaimer on the home page', async ({ page }) => {
        await expect(page.locator('.home-disclaimer')).toContainText('Educational Use Only');
        await expect(page.locator('.home-disclaimer')).toContainText('Do not rely on it as your sole source');
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

    test('should use FAA forecast data for future date and time selections', async ({ page }) => {
        await page.unroute('**/api/weather/*');
        await page.route('**/api/weather/*', async (route) => {
            const url = new URL(route.request().url());
            expect(url.searchParams.get('datetime')).toBeTruthy();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    temperature: 19,
                    altimeter: 29.73,
                    windSpeed: 14,
                    windDirection: 230,
                    elevation: 663,
                    lat: 41.9602,
                    lon: -87.9316,
                    variation: -3.96,
                    forecast: {
                        isForecast: true,
                        source: 'TAF',
                        message: 'Forecast loaded for KORD. Wind and temperature come from the FAA TAF; altimeter uses the latest available observation.',
                    },
                }),
            });
        });

        await page.fill('#date', '2026-05-01T14:30');
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();

        await expect(page.locator('#dep-temp')).toHaveValue('19');
        await expect(page.locator('#dep-altim')).toHaveValue('29.73');
        await expect(page.locator('#dep-weather-status')).toContainText('Forecast loaded for KORD.');
    });

    test('should show a clear message when no FAA forecast is available for the selected future time', async ({ page }) => {
        await page.unroute('**/api/weather/*');
        await page.route('**/api/weather/*', async (route) => {
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: 'No FAA forecast data is available for KORD at the selected date and time. TAF coverage is usually limited to about 24 to 30 hours.',
                }),
            });
        });

        await page.fill('#date', '2026-06-15T14:30');
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();

        await expect(page.locator('#dep-weather-status')).toContainText('No FAA forecast data is available for KORD at the selected date and time');
    });

    test('should keep default cruise altitude at 3000', async ({ page }) => {
        await expect(page.locator('#cruise-alt')).toHaveValue('3000');
    });

    test('should allow selecting other available aircraft profiles on the home page', async ({ page }) => {
        const aircraftOptions = await page.locator('#aircraft option').allTextContents();
        expect(aircraftOptions).toEqual(expect.arrayContaining([
            'Evektor Harmony LSA',
            'Cessna 152',
            'Cessna 172S Skyhawk',
        ]));

        await page.selectOption('#aircraft', 'Cessna 152');
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#generate-btn');

        await expect(page.locator('#out-aircraft')).toHaveText('Aircraft: Cessna 152');
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

    test('should assume K prefix when a 3-character alphanumeric airport code is entered', async ({ page }) => {
        const depInput = page.locator('#departure-icao');
        await depInput.fill('1C5');
        await depInput.blur();

        await expect(depInput).toHaveValue('K1C5');
        await expect(page.locator('#dep-lat')).toHaveValue('41.7584');
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
        await expect(page.locator('.destination-icao').nth(1)).toHaveValue('KORD');
        await expect(page.locator('.destination-icao').nth(2)).toHaveValue('KLOT');
        await expect(page.locator('#dep-lat')).toHaveValue('41.6031');
        expect(klotRequests).toBe(1);
    });

    test('should not generate the nav log when a destination weather lookup fails', async ({ page }) => {
        await page.unroute('**/api/weather/*');
        await page.route('**/api/weather/*', async (route) => {
            const url = new URL(route.request().url());
            const icao = url.pathname.split('/').pop().toUpperCase();
            if (icao === 'KORD') {
                await route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Weather service unavailable for KORD.' }),
                });
                return;
            }
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weatherFixtures[icao]) });
        });

        await page.fill('#departure-icao', 'KLOT');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#add-leg-btn');
        await page.locator('.destination-icao').nth(1).fill('KORD');
        await page.locator('.destination-icao').nth(1).blur();

        await expect(page.locator('.leg-weather-status').nth(1)).toContainText('Weather service unavailable for KORD.');
        await page.click('#generate-btn');
        await expect(page.locator('#status-banner')).toContainText('Leg 2 weather and coordinates must be loaded before generating the nav log.');
        await expect(page.locator('#nav-log-container')).toBeHidden();
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

    test('should close the menu when the user clicks a planner control', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await page.click('#menu-toggle');
        await expect(page.locator('#side-menu')).toHaveClass(/open/);

        await page.locator('#checkpoint-type-filter').click();
        await expect(page.locator('#side-menu')).not.toHaveClass(/open/);
    });

    test('should open the route map from the main page', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await expect(page.locator('#dep-lat')).toHaveValue('41.9602');
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await expect(page.locator('.leg-lat').first()).toHaveValue('41.7713');

        await page.click('#menu-toggle');
        await page.click('#open-map-btn');

        await expect(page).toHaveURL(/map\.html$/);
        await expect(page.locator('h1')).toHaveText('Route Map');
        await expect(page.locator('#map-status')).toHaveText('Street map mode. Route, airports, and checkpoints are plotted on OpenStreetMap.');
        await expect(page.locator('.route-list li')).toHaveCount(1);
        await expect(page.locator('[data-leg-toggle="0"]')).toBeChecked();
        await expect(page.locator('#export-kml-btn')).toBeVisible();
        await expect(page.locator('[data-map-mode="sectional"]')).toBeVisible();
        await expect(page.locator('#maximize-map-btn')).toBeVisible();
        await expect(page.locator('#toggle-reference-checkpoints-btn')).toBeVisible();
    });

    test('should load route airport weather on the map page', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#menu-toggle');
        await page.click('#open-map-btn');

        await expect(page.locator('#map-weather-status')).toHaveText('Loaded weather for 2 route airports.');
        await expect(page.locator('.route-weather-item')).toHaveCount(2);
        await expect(page.locator('.route-weather-item').first()).toContainText('KORD');
        await expect(page.locator('.route-weather-item').first()).toContainText('Observed');
        await expect(page.locator('.route-weather-item').first()).toContainText('VFR');
        await expect(page.locator('.route-weather-item').first()).toContainText('21.1 C');
        await expect(page.locator('.route-weather-item').first()).toContainText('Vis 10.0 sm');
        await expect(page.locator('.route-weather-item').first()).toContainText('Ceiling 4,500 ft');
        await expect(page.locator('.route-weather-item').first()).toContainText('-RA');
        await expect(page.locator('.route-weather-item').nth(1)).toContainText('KARR');
        await expect(page.locator('.route-weather-item').nth(1)).toContainText('IFR');
        await expect(page.locator('.route-weather-item').nth(1)).toContainText('300° @ 13 kt');
        await expect(page.locator('.route-weather-item').nth(1)).toContainText('TS');
    });

    test('should reuse home-page weather on the map page without refetching', async ({ page }) => {
        let weatherCalls = 0;
        let kordCalls = 0;
        await page.unroute('**/api/weather/*');
        await page.route('**/api/weather/*', async (route) => {
            weatherCalls += 1;
            const url = new URL(route.request().url());
            const icao = url.pathname.split('/').pop().toUpperCase();
             if (icao === 'KORD') {
                kordCalls += 1;
            }
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weatherFixtures[icao]) });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        const totalCallsBeforeMapOpen = weatherCalls;
        const kordCallsBeforeMapOpen = kordCalls;
        expect(kordCallsBeforeMapOpen).toBe(1);

        await page.click('#menu-toggle');
        await page.click('#open-map-btn');

        await expect(page.locator('#map-weather-status')).toHaveText('Loaded weather for 2 route airports.');
        expect(kordCalls).toBe(kordCallsBeforeMapOpen);
        expect(weatherCalls).toBeLessThanOrEqual(totalCallsBeforeMapOpen + 1);
    });

    test('should toggle airport weather layer on the map', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#menu-toggle');
        await page.click('#open-map-btn');

        await expect(page.locator('#toggle-weather-btn')).toHaveText('Show Airport Weather Layer');
        await expect(page.locator('.airport-weather-icon')).toHaveCount(0);

        await page.click('#toggle-weather-btn');
        await expect(page.locator('#toggle-weather-btn')).toHaveText('Hide Airport Weather Layer');
        await expect(page.locator('.airport-weather-icon')).toHaveCount(3);
        await expect(page.locator('.airport-weather-icon').first()).toContainText('ORD');
        await expect(page.locator('#weather-legend-bar')).toBeVisible();

        await page.click('#toggle-weather-btn');
        await expect(page.locator('#toggle-weather-btn')).toHaveText('Show Airport Weather Layer');
        await expect(page.locator('.airport-weather-icon')).toHaveCount(0);
        await expect(page.locator('#weather-legend-bar')).toBeHidden();
    });

    test('should show forecast weather on the map page for future flights', async ({ page }) => {
        await page.unroute('**/api/weather/*');
        await page.route('**/api/weather/*', async (route) => {
            const url = new URL(route.request().url());
            expect(url.searchParams.get('datetime')).toBeTruthy();
            const icao = url.pathname.split('/').pop().toUpperCase();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ...weatherFixtures[icao],
                    forecast: {
                        isForecast: true,
                        source: 'TAF',
                        validFrom: '2026-05-01T18:00:00.000Z',
                        validTo: '2026-05-01T21:00:00.000Z',
                        message: `Forecast loaded for ${icao}. Wind and temperature come from the FAA TAF; altimeter uses the latest available observation.`,
                    },
                }),
            });
        });

        await page.fill('#date', '2026-05-01T14:30');
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#menu-toggle');
        await page.click('#open-map-btn');

        await expect(page.locator('#map-weather-status')).toHaveText('Loaded forecast for 2 route airports.');
        await expect(page.locator('.route-weather-item').first()).toContainText('Forecast');
        await expect(page.locator('.route-weather-item').first()).toContainText('Valid 05/01');
    });

    test('should prefetch FAA airspace after generating the nav log', async ({ page }) => {
        let airspaceCalls = 0;
        await page.unroute('**/api/airspace*');
        await page.route('**/api/airspace*', async (route) => {
            airspaceCalls += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    type: 'FeatureCollection',
                    features: [],
                }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#generate-btn');

        await expect.poll(() => airspaceCalls).toBe(1);
    });

    test('should maximize the map and toggle nearby reference checkpoints', async ({ page }) => {
        await page.route('**/api/checkpoints/reference*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    checkpoints: [
                        { name: 'Nearby Visual', lat: 41.7, lon: -88.3, notes: 'Curated nearby visual checkpoint.' },
                    ],
                }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#menu-toggle');
        await page.click('#open-map-btn');

        await page.click('#maximize-map-btn');
        await expect(page.locator('.container')).toHaveClass(/map-maximized/);
        await expect(page.locator('#maximize-map-btn')).toHaveText('Exit Fullscreen');
        await expect(page.locator('body')).toHaveClass(/map-focus-mode/);
        await expect(page.locator('#route-panel')).toHaveClass(/collapsed/);
        await expect(page.locator('.container > h1')).toBeHidden();
        await expect(page.locator('#toggle-route-panel-btn')).toHaveText('Show Panel');

        await page.click('#toggle-route-panel-btn');
        await expect(page.locator('#route-panel')).not.toHaveClass(/collapsed/);
        await expect(page.locator('#toggle-route-panel-btn')).toHaveText('Hide Panel');
        await page.click('#toggle-route-panel-btn');
        await expect(page.locator('#route-panel')).toHaveClass(/collapsed/);

        await page.click('#maximize-map-btn');
        await expect(page.locator('.container')).not.toHaveClass(/map-maximized/);
        await page.click('#toggle-reference-checkpoints-btn');
        await expect(page.locator('#toggle-reference-checkpoints-btn')).toHaveText('Hide Nearby Reference Checkpoints');
    });

    test('should toggle FAA airspace on the route map', async ({ page }) => {
        let airspaceCalls = 0;
        await page.unroute('**/api/airspace*');
        await page.route('**/api/airspace*', async (route) => {
            airspaceCalls += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    type: 'FeatureCollection',
                    features: [
                        {
                            type: 'Feature',
                            geometry: {
                                type: 'Polygon',
                                coordinates: [[
                                    [-88.2, 41.7],
                                    [-87.8, 41.7],
                                    [-87.8, 42.0],
                                    [-88.2, 42.0],
                                    [-88.2, 41.7],
                                ]],
                            },
                            properties: {
                                name: 'Chicago Class B',
                                class: 'B',
                                typeCode: 'CLASS',
                                lowerDesc: 'SFC',
                                lowerVal: 0,
                                lowerUom: 'FT',
                                lowerCode: 'SFC',
                                upperDesc: '10000 MSL',
                                upperVal: 10000,
                                upperUom: 'FT',
                                upperCode: 'MSL',
                            },
                        },
                    ],
                }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#menu-toggle');
        await page.click('#open-map-btn');

        await page.click('#toggle-airspace-btn');
        await expect(page.locator('#toggle-airspace-btn')).toHaveText('Hide FAA Airspace');
        expect(airspaceCalls).toBeLessThanOrEqual(1);

        await page.click('#toggle-airspace-btn');
        await expect(page.locator('#toggle-airspace-btn')).toHaveText('Show FAA Airspace');

        await page.click('#toggle-airspace-btn');
        await expect(page.locator('#toggle-airspace-btn')).toHaveText('Hide FAA Airspace');
        expect(airspaceCalls).toBeLessThanOrEqual(1);

        await page.goto('/index.html?restoreDraft=1');
        await page.click('#menu-toggle');
        await page.click('#open-map-btn');
        await page.click('#toggle-airspace-btn');
        expect(airspaceCalls).toBeLessThanOrEqual(1);
    });

    test('should load the airspace profile page and share cached FAA airspace with the map page', async ({ page }) => {
        let airspaceCalls = 0;
        await page.unroute('**/api/airspace*');
        await page.route('**/api/airspace*', async (route) => {
            airspaceCalls += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    type: 'FeatureCollection',
                    features: [
                        {
                            type: 'Feature',
                            geometry: {
                                type: 'Polygon',
                                coordinates: [[
                                    [-88.2, 41.7],
                                    [-87.8, 41.7],
                                    [-87.8, 42.0],
                                    [-88.2, 42.0],
                                    [-88.2, 41.7],
                                ]],
                            },
                            properties: {
                                name: 'Chicago Class B',
                                class: 'B',
                                typeCode: 'CLASS',
                                lowerDesc: 'SFC',
                                lowerVal: 0,
                                lowerUom: 'FT',
                                lowerCode: 'SFC',
                                upperDesc: '10000 MSL',
                                upperVal: 10000,
                                upperUom: 'FT',
                                upperCode: 'MSL',
                            },
                        },
                    ],
                }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#menu-toggle');
        await page.click('#open-airspace-profile-btn');

        await expect(page).toHaveURL(/airspace-profile\.html$/);
        await expect(page.locator('h1')).toHaveText('Airspace Profile');
        await expect(page.locator('.profile-scroll svg')).toBeVisible();
        expect(airspaceCalls).toBe(1);

        await page.click('#menu-toggle');
        await page.click('text=Route Map');
        await page.click('#toggle-airspace-btn');
        expect(airspaceCalls).toBe(1);
    });

    test('should reflect updated cruise altitude on the airspace profile page', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.fill('#cruise-alt', '4500');

        await page.click('#menu-toggle');
        await page.click('#open-airspace-profile-btn');

        await expect(page).toHaveURL(/airspace-profile\.html$/);
        await expect(page.locator('.profile-scroll svg')).toContainText('Leg 1 cruise 4,500 ft');
    });

    test('should show post-nav-log quick navigation buttons only after nav log generation', async ({ page }) => {
        await expect(page.locator('#post-navlog-actions')).not.toHaveClass(/visible/);

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#generate-btn');

        await expect(page.locator('#post-navlog-actions')).toHaveClass(/visible/);
        await expect(page.locator('#post-open-checkpoints-btn')).toBeVisible();
        await expect(page.locator('#post-open-map-btn')).toBeVisible();
        await expect(page.locator('#post-open-airspace-profile-btn')).toBeVisible();
    });

    test('should toggle current location on the route map', async ({ page }) => {
        await page.addInitScript(() => {
            let nextWatchId = 1;
            Object.defineProperty(navigator, 'geolocation', {
                configurable: true,
                value: {
                    watchPosition(success) {
                        const watchId = nextWatchId++;
                        window.setTimeout(() => {
                            success({
                                coords: {
                                    latitude: 41.8001,
                                    longitude: -88.2102,
                                    accuracy: 42,
                                },
                            });
                        }, 50);
                        return watchId;
                    },
                    clearWatch() {},
                },
            });
        });

        await page.reload();
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#menu-toggle');
        await page.click('#open-map-btn');

        await page.click('#toggle-location-btn');
        await expect(page.locator('#toggle-location-btn')).toHaveText('Hide Current Location');
        await expect(page.locator('.current-location-icon')).toHaveCount(1);

        await page.click('#toggle-location-btn');
        await expect(page.locator('#toggle-location-btn')).toHaveText('Show Current Location');
        await expect(page.locator('.current-location-icon')).toHaveCount(0);
    });

    test('should fall back cleanly when the FAA sectional overlay cannot be loaded', async ({ page }) => {
        await page.route('**/api/charts/sectional*', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'FAA sectional metadata request failed.' }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-map-btn');
        await page.click('[data-map-mode="sectional"]');

        await expect(page.locator('#map-status')).toContainText('terrain');
    });

    test('should open the route map from the checkpoints planner without regenerating checkpoints', async ({ page }) => {
        let generateCalls = 0;
        await page.unroute('**/api/checkpoints/generate*');
        await page.route('**/api/checkpoints/generate*', async (route) => {
            generateCalls += 1;
            const draft = route.request().postDataJSON();
            const legs = draft.legs.map((leg, index) => ({
                legIndex: index,
                fromIcao: index === 0 ? draft.departure.icao : draft.legs[index - 1].icao,
                toIcao: leg.icao,
                legDistanceNm: 20,
                spacingNm: 6.7,
                checkpoints: [
                    {
                        name: `${leg.icao} CHECKPOINT`,
                        distanceFromLegStartNm: 7,
                        comms: airportCommsFixtures[leg.icao]?.summary || 'VIS',
                    },
                ],
            }));

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ routeSignature, legs }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await expect(page.locator('[data-field="name"]').first()).toHaveValue('KARR CHECKPOINT');
        expect(generateCalls).toBe(1);

        await page.click('#open-map-btn');
        await expect(page).toHaveURL(/map\.html$/);
        await expect(page.locator('.checkpoint-button')).toContainText(['KARR CHECKPOINT']);
        expect(generateCalls).toBe(1);
    });

    test('should default to enhanced checkpoint generation in the planner', async ({ page }) => {
        let requestedModes = [];
        await page.unroute('**/api/checkpoints/generate*');
        await page.route('**/api/checkpoints/generate*', async (route) => {
            const url = new URL(route.request().url());
            const mode = url.searchParams.get('mode') || 'enhanced';
            requestedModes.push(mode);
            const draft = route.request().postDataJSON();
            const legs = draft.legs.map((leg, index) => ({
                legIndex: index,
                fromIcao: index === 0 ? draft.departure.icao : draft.legs[index - 1].icao,
                toIcao: leg.icao,
                legDistanceNm: 20,
                spacingNm: 6.7,
                checkpoints: [
                    {
                        name: mode === 'enhanced' ? `${leg.icao} VISUAL CHECKPOINT` : `${leg.icao} CHECKPOINT`,
                        distanceFromLegStartNm: 7,
                        comms: airportCommsFixtures[leg.icao]?.summary || 'VIS',
                        type: mode === 'enhanced' ? 'visual_checkpoint' : undefined,
                        source: mode === 'enhanced' ? 'chart_candidate' : undefined,
                    },
                ],
            }));

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ routeSignature, mode, legs }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await expect(page.locator('[data-field="name"]').first()).toHaveValue('KARR VISUAL CHECKPOINT');
        await expect(page.locator('.checkpoint-badge')).toContainText(['Visual Checkpoint', 'Visual Priority']);
        await expect(page.locator('.mode-label')).toHaveText('Enhanced');
        expect(requestedModes[0]).toBe('enhanced');
    });

    test('should show enhanced checkpoints on the map after regenerating from the planner menu path', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await expect(page.locator('[data-field="name"]').first()).toHaveValue('KARR VISUAL CHECKPOINT');

        await page.click('#menu-toggle');
        await page.evaluate(() => {
            window.location.assign('/map.html');
        });
        await expect(page).toHaveURL(/map\.html$/);
        await expect(page.locator('.checkpoint-button')).toContainText(['KARR VISUAL CHECKPOINT']);
    });

    test('should keep enhanced regeneration working after visiting map and aircraft profiles first', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('text=GENERATE NAV LOG');

        await page.click('#menu-toggle');
        await page.click('#open-map-btn');
        await expect(page).toHaveURL(/map\.html$/);

        await page.evaluate(() => {
            window.location.assign('/aircraft.html');
        });
        await expect(page).toHaveURL(/aircraft\.html$/);

        await page.evaluate(() => {
            window.location.assign('/checkpoints.html');
        });
        await expect(page).toHaveURL(/checkpoints\.html$/);

        await expect(page.locator('[data-field="name"]').first()).toHaveValue('KARR VISUAL CHECKPOINT');
    });

    test('should show a loading progress bar while regenerating checkpoints', async ({ page }) => {
        await page.unroute('**/api/checkpoints/generate*');
        await page.route('**/api/checkpoints/generate*', async (route) => {
            const url = new URL(route.request().url());
            const mode = url.searchParams.get('mode') || 'classic';
            const draft = route.request().postDataJSON();

            await new Promise((resolve) => setTimeout(resolve, 700));

            const legs = draft.legs.map((leg, index) => ({
                legIndex: index,
                fromIcao: index === 0 ? draft.departure.icao : draft.legs[index - 1].icao,
                toIcao: leg.icao,
                legDistanceNm: 20,
                spacingNm: 6.7,
                checkpoints: [
                    {
                        name: mode === 'enhanced' ? `${leg.icao} VISUAL CHECKPOINT` : `${leg.icao} CHECKPOINT`,
                        distanceFromLegStartNm: 7,
                        comms: airportCommsFixtures[leg.icao]?.summary || 'VIS',
                        type: mode === 'enhanced' ? 'visual_checkpoint' : undefined,
                        source: mode === 'enhanced' ? 'chart_candidate' : undefined,
                    },
                ],
            }));

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ routeSignature, mode, legs }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await page.click('#regenerate-btn');

        await expect(page.locator('#loading-progress')).toBeVisible();
        await expect(page.locator('#loading-progress-label')).toContainText('Loading');
        await expect(page.locator('#loading-progress')).toBeHidden();
    });

    test('should show a loading progress bar while generating the nav log checkpoints', async ({ page }) => {
        await page.unroute('**/api/checkpoints/generate*');
        await page.route('**/api/checkpoints/generate*', async (route) => {
            const draft = route.request().postDataJSON();
            await new Promise((resolve) => setTimeout(resolve, 700));
            const legs = draft.legs.map((leg, index) => ({
                legIndex: index,
                fromIcao: index === 0 ? draft.departure.icao : draft.legs[index - 1].icao,
                toIcao: leg.icao,
                legDistanceNm: 20,
                spacingNm: 6.7,
                checkpoints: [
                    {
                        name: `${leg.icao} CHECKPOINT`,
                        distanceFromLegStartNm: 7,
                        comms: airportCommsFixtures[leg.icao]?.summary || 'VIS',
                    },
                ],
            }));

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ routeSignature, legs }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#generate-btn');

        await expect(page.locator('#loading-progress')).toBeVisible();
        await expect(page.locator('#loading-progress-label')).toContainText('Loading');
        await expect(page.locator('#loading-progress')).toBeHidden();
    });

    test('should show enhanced checkpoint metadata on the route map', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await page.click('#regenerate-btn');
        await page.click('#save-btn');
        await page.click('#open-map-btn');

        await expect(page).toHaveURL(/map\.html$/);
        await page.click('[data-accordion-toggle="checkpoints"]');
        await expect(page.locator('.checkpoint-button').first()).toContainText('KARR VISUAL CHECKPOINT');
        await expect(page.locator('.checkpoint-button .checkpoint-badge')).toContainText(['Visual Checkpoint', 'Visual Priority']);
    });

    test('should filter enhanced checkpoints in the planner and route map', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await page.click('#regenerate-btn');

        await expect(page.locator('[data-checkpoint-row]')).toHaveCount(1);
        await page.selectOption('#checkpoint-source-filter', 'airport_reference');
        await expect(page.locator('#planner-root .empty-state')).toContainText('No checkpoints match the current filters for this leg.');
        await page.selectOption('#checkpoint-source-filter', 'all');
        await page.click('#save-btn');
        await page.click('#open-map-btn');

        await page.click('[data-accordion-toggle="checkpoints"]');
        await expect(page.locator('.checkpoint-list-item')).toHaveCount(1);
        await page.selectOption('#map-checkpoint-source-filter', 'airport_reference');
        await expect(page.locator('.checkpoint-list-item.is-hidden')).toHaveCount(1);
        await page.selectOption('#map-checkpoint-source-filter', 'all');
        await expect(page.locator('.checkpoint-list-item.is-hidden')).toHaveCount(0);
    });

    test('should ignore legacy saved CP placeholder plans and regenerate checkpoints', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.evaluate((legacyPlan) => {
            window.localStorage.setItem('openflight-ai-checkpoints', JSON.stringify(legacyPlan));
        }, {
            routeSignature,
            version: 1,
            legs: [{
                checkpoints: [{ name: 'KORD-KARR CP1', distanceFromLegStartNm: 7, comms: 'VIS' }],
            }],
        });

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');

        await expect(page.locator('[data-field="name"]').first()).toHaveValue('KARR VISUAL CHECKPOINT');
    });

    test('should load checkpoints for the nav log instead of using legacy CP placeholders', async ({ page }) => {
        await page.evaluate((legacyPlan) => {
            window.localStorage.setItem('openflight-ai-checkpoints', JSON.stringify(legacyPlan));
        }, {
            routeSignature,
            version: 1,
            legs: [{
                checkpoints: [{ name: 'KORD-KARR CP1', distanceFromLegStartNm: 7, comms: 'VIS' }],
            }],
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('text=GENERATE NAV LOG');

        await expect(page.locator('#table3-body tr').first().locator('td').first()).toHaveText('KARR VISUAL CHECKPOINT');
    });

    test('should change generate nav log button to close nav log while the nav log is visible', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await expect(page.locator('#generate-btn')).toHaveText('GENERATE NAV LOG');
        await page.click('#generate-btn');
        await expect(page.locator('#nav-log-container')).toBeVisible();
        await expect(page.locator('#generate-btn')).toHaveText('CLOSE NAV LOG');
        await page.click('#generate-btn');
        await expect(page.locator('#nav-log-container')).toBeHidden();
        await expect(page.locator('#generate-btn')).toHaveText('OPEN NAV LOG');
    });

    test('should open the aircraft profiles page and list available profiles', async ({ page }) => {
        await page.click('#menu-toggle');
        await page.click('#open-aircraft-btn');

        await expect(page).toHaveURL(/aircraft\.html$/);
        await expect(page.locator('h1')).toHaveText('Aircraft Profiles');
        await expect(page.locator('.profile-card')).toHaveCount(3);
        await expect(page.locator('.profile-card')).toContainText([
            'Cessna 152 / Lycoming O-235-L2C',
            'Cessna 172S Skyhawk / Lycoming IO-360-L2A',
            'Evektor Harmony LSA / Rotax 912 ULS',
        ]);
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

    test('should keep open nav log button state when returning from the checkpoints planner', async ({ page }) => {
        await page.fill('#departure-icao', 'KLOT');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#generate-btn');
        await expect(page.locator('#generate-btn')).toHaveText('CLOSE NAV LOG');

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await expect(page).toHaveURL(/checkpoints\.html$/);

        await page.click('#menu-toggle');
        await page.click('text=Back To Flight Setup');
        await expect(page).toHaveURL(/index\.html$/);
        await expect(page.locator('#generate-btn')).toHaveText('CLOSE NAV LOG');
    });

    test('should reset nav log state after saving changed checkpoints in the planner', async ({ page }) => {
        await page.fill('#departure-icao', 'KLOT');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('#generate-btn');
        await expect(page.locator('#generate-btn')).toHaveText('CLOSE NAV LOG');

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await expect(page).toHaveURL(/checkpoints\.html$/);
        await page.locator('[data-field="name"]').first().fill('UPDATED CHECKPOINT');
        await page.click('#save-btn');

        await page.click('#menu-toggle');
        await page.click('text=Back To Flight Setup');
        await expect(page).toHaveURL(/index\.html$/);
        await expect(page.locator('#generate-btn')).toHaveText('GENERATE NAV LOG');
    });

    test('should preserve nav-log draft data when returning from aircraft profiles', async ({ page }) => {
        await page.fill('#departure-icao', 'KLOT');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-aircraft-btn');
        await expect(page).toHaveURL(/aircraft\.html$/);

        await page.click('#menu-toggle');
        await page.click('text=Flight Setup');
        await expect(page).toHaveURL(/index\.html/);
        await expect(page.locator('#departure-icao')).toHaveValue('KLOT');
        await expect(page.locator('.destination-icao').first()).toHaveValue('KARR');
        await expect(page.locator('#dep-lat')).toHaveValue('41.6031');
    });

    test('should load a saved plan file, refresh weather live, and restore planner and map state', async ({ page }) => {
        const plan = {
            app: 'cielorumbo',
            version: 1,
            savedAt: '2026-04-27T12:00:00.000Z',
            flightDraft: {
                aircraftName: 'Evektor Harmony LSA',
                date: '2026-04-27',
                departure: { icao: 'KLOT', airportAlt: 673, lat: 41.6031, lon: -88.1017 },
                legs: [
                    { icao: 'KARR', plannedAlt: 3000, airportElevation: 699, lat: 41.7713, lon: -88.4815 },
                    { icao: 'KSQI', plannedAlt: 3000, airportElevation: 654, lat: 41.7428, lon: -89.6762 },
                ],
            },
            checkpointPlan: {
                version: 2,
                routeSignature: JSON.stringify({
                    departure: { icao: 'KLOT', lat: 41.6031, lon: -88.1017 },
                    legs: [
                        { icao: 'KARR', lat: 41.7713, lon: -88.4815 },
                        { icao: 'KSQI', lat: 41.7428, lon: -89.6762 },
                    ],
                }),
                legs: [
                    {
                        checkpoints: [
                            { name: 'AURORA CHECKPOINT', distanceFromLegStartNm: 7, comms: 'AWOS 118.525 | CTAF 120.1' },
                        ],
                    },
                    {
                        checkpoints: [
                            { name: 'DIXON CHECKPOINT', distanceFromLegStartNm: 8, comms: 'AWOS 119.275 | CTAF 122.8' },
                        ],
                    },
                ],
            },
        };

        await page.locator('#load-plan-input').setInputFiles({
            name: 'openflight-plan.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(plan)),
        });

        await expect(page.locator('#departure-icao')).toHaveValue('KLOT');
        await expect(page.locator('.destination-icao').nth(0)).toHaveValue('KARR');
        await expect(page.locator('.destination-icao').nth(1)).toHaveValue('KSQI');
        await expect(page.locator('#dep-temp')).toHaveValue('20');
        await expect(page.locator('.leg-weather-status').nth(1)).toHaveText('Weather loaded for KSQI.');
        await expect(page.locator('#generate-btn')).toHaveText('GENERATE NAV LOG');

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await expect(page).toHaveURL(/checkpoints\.html$/);
        await expect(page.locator('[data-field="name"]').nth(0)).toHaveValue('AURORA CHECKPOINT');
        await expect(page.locator('[data-field="name"]').nth(1)).toHaveValue('DIXON CHECKPOINT');

        await page.click('#open-map-btn');
        await expect(page).toHaveURL(/map\.html$/);
        await expect(page.locator('.route-list li')).toHaveCount(2);
        await expect(page.locator('.checkpoint-button')).toContainText(['AURORA CHECKPOINT', 'DIXON CHECKPOINT']);
    });

    test('should save edited and added planner checkpoints back into table 3', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');

        await page.locator('[data-field="name"]').first().fill('FOX RIVER');
        await page.locator('.add-checkpoint-btn').first().click();
        await page.locator('[data-field="name"]').nth(1).fill('CUSTOM WATER TOWER');
        await page.locator('[data-field="comms"]').nth(1).fill('AWOS 118.525 | CTAF 120.1');
        await page.click('#save-btn');

        await page.click('#menu-toggle');
        await page.click('text=Back To Flight Setup');
        await expect(page).toHaveURL(/index\.html/);
        await expect(page.locator('#departure-icao')).toHaveValue('KORD');
        await expect(page.locator('.destination-icao').first()).toHaveValue('KARR');
        await page.click('text=GENERATE NAV LOG');

        await expect(page.locator('#table3-body tr').nth(0).locator('td').first()).toHaveText('FOX RIVER');
        await expect(page.locator('#table3-body tr').nth(1).locator('td').first()).toHaveText('CUSTOM WATER TOWER');
        await expect(page.locator('#table3-body tr').nth(1).locator('td').nth(6)).toHaveText('AWOS 118.525 | CTAF 120.1');
    });

    test('should show colored planner checkpoint badges and calculated distance summaries', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');

        const firstTypeBadge = page.locator('[data-checkpoint-row="0:0"] .checkpoint-badge.visual').first();
        await expect(firstTypeBadge).toHaveText('Visual Checkpoint');
        await expect(page.locator('[data-checkpoint-row="0:0"] [data-field="distance"]')).toHaveCount(0);
        await expect(page.locator('[data-checkpoint-row="0:0"] .checkpoint-distance-primary')).toContainText('7.0 NM');
        await expect(page.locator('[data-checkpoint-row="0:0"] .checkpoint-distance-secondary')).toContainText('7.0 NM');

        await page.locator('.add-checkpoint-btn').first().click();
        await expect(page.locator('[data-checkpoint-row="0:1"] [data-field="distance"]')).toHaveCount(0);
        await expect(page.locator('[data-checkpoint-row="0:1"] .checkpoint-badge.manual')).toHaveText('Manual');
        await expect(page.locator('[data-checkpoint-row="0:1"] .checkpoint-distance-primary')).toContainText('13.7 NM');
        await expect(page.locator('[data-checkpoint-row="0:1"] .checkpoint-distance-secondary')).toContainText('6.7 NM');
    });

    test('should remove a planner checkpoint and reflect that removal in table 3', async ({ page }) => {
        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');

        await expect(page.locator('[data-field="name"]')).toHaveCount(1);
        await page.locator('.add-checkpoint-btn').first().click();
        await page.locator('[data-field="name"]').nth(1).fill('REMOVE ME');
        await page.locator('.remove-checkpoint-btn').nth(1).click();
        await expect(page.locator('[data-field="name"]')).toHaveCount(1);
        await page.click('#save-btn');

        await page.click('#menu-toggle');
        await page.click('text=Back To Flight Setup');
        await expect(page).toHaveURL(/index\.html/);
        await page.click('text=GENERATE NAV LOG');

        await expect(page.locator('#table3-body tr')).toHaveCount(2);
        await expect(page.locator('#table3-body')).not.toContainText('REMOVE ME');
    });

    test('should reuse checkpoints generated on the home page when opening the planner', async ({ page }) => {
        let generateCalls = 0;
        await page.unroute('**/api/checkpoints/generate*');
        await page.route('**/api/checkpoints/generate*', async (route) => {
            generateCalls += 1;
            const draft = route.request().postDataJSON();
            const legs = draft.legs.map((leg, index) => ({
                legIndex: index,
                fromIcao: index === 0 ? draft.departure.icao : draft.legs[index - 1].icao,
                toIcao: leg.icao,
                legDistanceNm: 20,
                spacingNm: 6.7,
                checkpoints: [
                    {
                        name: `${leg.icao} CHECKPOINT`,
                        distanceFromLegStartNm: 7,
                        comms: airportCommsFixtures[leg.icao]?.summary || 'VIS',
                    },
                ],
            }));

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ routeSignature, legs }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('text=GENERATE NAV LOG');
        expect(generateCalls).toBe(1);

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await expect(page.locator('[data-field="name"]').first()).toHaveValue('KARR CHECKPOINT');
        expect(generateCalls).toBe(1);
    });

    test('should reuse planner-generated checkpoints when generating the nav log', async ({ page }) => {
        let generateCalls = 0;
        await page.unroute('**/api/checkpoints/generate*');
        await page.route('**/api/checkpoints/generate*', async (route) => {
            generateCalls += 1;
            const draft = route.request().postDataJSON();
            const legs = draft.legs.map((leg, index) => ({
                legIndex: index,
                fromIcao: index === 0 ? draft.departure.icao : draft.legs[index - 1].icao,
                toIcao: leg.icao,
                legDistanceNm: 20,
                spacingNm: 6.7,
                checkpoints: [
                    {
                        name: `${leg.icao} CHECKPOINT`,
                        distanceFromLegStartNm: 7,
                        comms: airportCommsFixtures[leg.icao]?.summary || 'VIS',
                    },
                ],
            }));

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ routeSignature, legs }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await expect(page.locator('[data-field="name"]').first()).toHaveValue('KARR CHECKPOINT');
        expect(generateCalls).toBe(1);

        await page.click('#menu-toggle');
        await page.click('text=Back To Flight Setup');
        await page.click('text=GENERATE NAV LOG');
        await expect(page.locator('#table3-body tr').first().locator('td').first()).toHaveText('KARR CHECKPOINT');
        expect(generateCalls).toBe(1);
    });

    test('should reuse home-page generated placeholder checkpoints when opening the planner', async ({ page }) => {
        let generateCalls = 0;
        await page.unroute('**/api/checkpoints/generate*');
        await page.route('**/api/checkpoints/generate*', async (route) => {
            generateCalls += 1;
            const draft = route.request().postDataJSON();
            const legs = draft.legs.map((leg, index) => ({
                legIndex: index,
                fromIcao: index === 0 ? draft.departure.icao : draft.legs[index - 1].icao,
                toIcao: leg.icao,
                legDistanceNm: 20,
                spacingNm: 6.7,
                checkpoints: [
                    {
                        name: `${index === 0 ? draft.departure.icao : draft.legs[index - 1].icao}-${leg.icao} CP1`,
                        distanceFromLegStartNm: 7,
                        comms: 'VIS',
                    },
                ],
            }));

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ routeSignature, legs }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('text=GENERATE NAV LOG');
        expect(generateCalls).toBe(1);

        await page.click('#menu-toggle');
        await page.click('#open-checkpoints-btn');
        await expect(page.locator('[data-field="name"]').first()).toHaveValue('KORD-KARR CP1');
        expect(generateCalls).toBe(1);
    });

    test('should reuse home-page generated checkpoints when opening the map and then the planner', async ({ page }) => {
        let generateCalls = 0;
        await page.unroute('**/api/checkpoints/generate*');
        await page.route('**/api/checkpoints/generate*', async (route) => {
            generateCalls += 1;
            const draft = route.request().postDataJSON();
            const legs = draft.legs.map((leg, index) => ({
                legIndex: index,
                fromIcao: index === 0 ? draft.departure.icao : draft.legs[index - 1].icao,
                toIcao: leg.icao,
                legDistanceNm: 20,
                spacingNm: 6.7,
                checkpoints: [
                    {
                        name: `${leg.icao} CHECKPOINT`,
                        distanceFromLegStartNm: 7,
                        comms: airportCommsFixtures[leg.icao]?.summary || 'VIS',
                    },
                ],
            }));

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ routeSignature, legs }),
            });
        });

        await page.fill('#departure-icao', 'KORD');
        await page.locator('#departure-icao').blur();
        await page.fill('.destination-icao', 'KARR');
        await page.locator('.destination-icao').blur();
        await page.click('text=GENERATE NAV LOG');
        await expect(page.locator('#table3-body tr').first().locator('td').first()).toHaveText('KARR CHECKPOINT');
        expect(generateCalls).toBe(1);

        await page.click('#menu-toggle');
        await page.click('#open-map-btn');
        await expect(page).toHaveURL(/map\.html$/);

        await page.evaluate(() => {
            window.location.assign('/checkpoints.html');
        });
        await expect(page).toHaveURL(/checkpoints\.html$/);
        await expect(page.locator('[data-field="name"]').first()).toHaveValue('KARR CHECKPOINT');
        expect(generateCalls).toBe(1);
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
            version: 2,
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
        await expect(page.locator('#table3-body tr')).toHaveCount(4);
        await expect(page.locator('#table2-body tr').first().locator('td').nth(4)).toHaveText('-3.96');
    });
});
