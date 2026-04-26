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
        expect(result.variation).toBeCloseTo(-3.8, 1);
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
        expect(result.variation).toBeCloseTo(-3.8, 1);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[2][0]).toContain('/airport?ids=KLOT');
    });

    test('parses the real AviationWeather METAR wrapper shape', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
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
        expect(result.variation).toBeCloseTo(-3.79, 2);
    });

    test('uses the nearest METAR station for airports without METAR', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () => '',
                status: 200,
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => '',
                status: 200,
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => '',
                status: 200,
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => '',
                status: 200,
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => '',
                status: 200,
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => [
                    'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,gps_code,iata_code,local_code,home_link,wikipedia_link,keywords',
                    '1,1C5,small_airport,Clow International Airport,41.6954,-88.1292,670,NA,US,US-IL,Bolingbrook,no,,,"1C5",,,',
                ].join('\n'),
                status: 200,
            })
            .mockResolvedValueOnce({
                ok: true,
                arrayBuffer: async () => {
                    const { gzipSync } = await import('node:zlib');
                    const stations = JSON.stringify([
                        { icaoId: 'KLOT', lat: 41.6031, lon: -88.1017, siteType: ['METAR'] },
                        { icaoId: 'KDPA', lat: 41.9078, lon: -88.2486, siteType: ['METAR'] },
                    ]);
                    const gzipped = gzipSync(Buffer.from(stations, 'utf8'));
                    return gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength);
                },
                status: 200,
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => JSON.stringify({
                    value: [{
                        temp: 22,
                        altim: 1007.0,
                        wspd: 15,
                        wdir: 260,
                        lat: 41.6031,
                        lon: -88.1017,
                        elev: 205,
                    }],
                }),
                status: 200,
            });

        const result = await getWeatherData('K1C5');

        expect(result).toMatchObject({
            temperature: 22,
            altimeter: 29.74,
            windSpeed: 15,
            windDirection: 260,
            lat: 41.6954,
            lon: -88.1292,
            elevation: 670,
            weatherSourceIcao: 'KLOT',
        });
        expect(result.variation).toBeCloseTo(-3.8, 1);
    });

    test('treats empty AviationWeather bodies as no data instead of throwing JSON parse errors', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({ ok: true, text: async () => '', status: 200 })
            .mockResolvedValueOnce({ ok: true, text: async () => '', status: 200 })
            .mockResolvedValueOnce({ ok: true, text: async () => '', status: 200 })
            .mockResolvedValueOnce({ ok: true, text: async () => '', status: 200 })
            .mockResolvedValueOnce({ ok: true, text: async () => '', status: 200 })
            .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });

        await expect(getWeatherData('K1C5')).rejects.not.toThrow('Unexpected end of JSON input');
    });

    test('calculates magnetic variation locally without an extra API call', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
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
                }),
            });

        const result = await getWeatherData('KLOT');

        expect(result.variation).toBeCloseTo(-3.79, 2);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('retries transient 503 responses before succeeding', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
            .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => JSON.stringify({
                    value: [{
                        temp: 21,
                        altim: 1006.9,
                        wspd: 16,
                        wdir: 250,
                        lat: 41.6031,
                        lon: -88.1017,
                        elev: 205,
                    }],
                }),
                status: 200,
            });

        const result = await getWeatherData('KLOT');

        expect(result.temperature).toBe(21);
        expect(global.fetch).toHaveBeenCalledTimes(3);
    });
});
