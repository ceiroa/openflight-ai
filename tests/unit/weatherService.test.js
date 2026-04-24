import { jest } from '@jest/globals';
import { getWeatherData } from '../../src/api/weatherService.js';

describe('getWeatherData', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    test('uses station info when METAR is missing coordinates', async () => {
        const fetchMock = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    value: [{
                        temp: 20,
                        altim: 1006.9,
                        wspd: 12,
                        wdir: 250,
                    }],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    value: [{
                        lat: 41.60308,
                        lon: -88.10167,
                        elev: 205,
                    }],
                }),
            });

        global.fetch = fetchMock;

        const result = await getWeatherData('KLOT');

        expect(result).toMatchObject({
            temperature: 20,
            altimeter: 29.73,
            windSpeed: 12,
            windDirection: 250,
            lat: 41.60308,
            lon: -88.10167,
            elevation: 673,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toContain('/stationinfo?ids=KLOT');
    });

    test('uses airport info when station info is unavailable', async () => {
        const fetchMock = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    value: [{
                        temp: 18,
                        altim: 29.82,
                        wspd: 8,
                        wdir: 90,
                    }],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    value: [],
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    value: [{
                        lat: 41.6081,
                        lon: -88.0964,
                        elev: 207,
                    }],
                }),
            });

        global.fetch = fetchMock;

        const result = await getWeatherData('KLOT');

        expect(result.lat).toBe(41.6081);
        expect(result.lon).toBe(-88.0964);
        expect(result.elevation).toBe(679);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[2][0]).toContain('/airport?ids=KLOT');
    });

    test('parses the real AviationWeather METAR wrapper shape', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                value: [{
                    temp: 21,
                    altim: 1006.9,
                    wspd: 16,
                    wdir: 250,
                    lat: 41.6031,
                    lon: -88.1017,
                    elev: 205,
                }],
                Count: 1,
            }),
        });

        const result = await getWeatherData('KLOT');

        expect(result).toMatchObject({
            temperature: 21,
            altimeter: 29.73,
            windSpeed: 16,
            windDirection: 250,
            lat: 41.6031,
            lon: -88.1017,
            elevation: 673,
        });
    });
});
