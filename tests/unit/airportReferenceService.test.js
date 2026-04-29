import { jest } from '@jest/globals';
import {
    __resetAirportReferenceCaches,
    generateEnhancedCheckpointsForRoute,
    generateNamedCheckpointsForRoute,
    getAirportCommsByCode,
} from '../../src/api/airportReferenceService.js';

describe('airport reference service', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        __resetAirportReferenceCaches();
        jest.restoreAllMocks();
    });

    test('returns airport weather and traffic frequencies', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () => [
                    'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,gps_code,iata_code,local_code,home_link,wikipedia_link,keywords',
                    '1,KARR,small_airport,Aurora Municipal Airport,41.7713,-88.4757,699,NA,US,US-IL,Aurora,no,KARR,,ARR,,,',
                ].join('\n'),
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => [
                    'id,airport_ref,airport_ident,type,description,frequency_mhz',
                    '1,1,KARR,ASOS,ASOS,118.525',
                    '2,1,KARR,CTAF,CTAF,120.100',
                ].join('\n'),
            });

        const comms = await getAirportCommsByCode('KARR');

        expect(comms.summary).toBe('ASOS 118.525 | CTAF 120.100');
    });

    test('uses named landmarks from map data before synthetic CP labels', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () => [
                    'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,gps_code,iata_code,local_code,home_link,wikipedia_link,keywords',
                    '1,KLOT,small_airport,Lewis University Airport,41.6073,-88.0945,663,NA,US,US-IL,Romeoville,no,KLOT,,LOT,,,',
                    '2,KARR,small_airport,Aurora Municipal Airport,41.7713,-88.4757,699,NA,US,US-IL,Aurora,no,KARR,,ARR,,,',
                ].join('\n'),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    elements: [
                        {
                            type: 'way',
                            tags: { name: 'Silver Springs Lake', water: 'lake' },
                            center: { lat: 41.69, lon: -88.25 },
                        },
                    ],
                }),
            });

        const plan = await generateNamedCheckpointsForRoute({
            departure: { icao: 'KLOT', lat: 41.6073, lon: -88.0945 },
            legs: [{ icao: 'KARR', lat: 41.7713, lon: -88.4757 }],
        });

        expect(plan[0].checkpoints[0].name).toBe('Silver Springs Lake');
        expect(plan[0].checkpoints[0].comms).toBe('VIS');
    });

    test('enhanced mode prioritizes curated visual checkpoints when available', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () => [
                    'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,gps_code,iata_code,local_code,home_link,wikipedia_link,keywords',
                    '1,KLOT,small_airport,Lewis University Airport,41.6073,-88.0945,663,NA,US,US-IL,Romeoville,no,KLOT,,LOT,,,',
                    '2,KARR,small_airport,Aurora Municipal Airport,41.7713,-88.4757,699,NA,US,US-IL,Aurora,no,KARR,,ARR,,,',
                ].join('\n'),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ elements: [] }),
            });

        const plan = await generateEnhancedCheckpointsForRoute({
            departure: { icao: 'KLOT', lat: 41.6073, lon: -88.0945 },
            legs: [{ icao: 'KARR', lat: 41.7713, lon: -88.4757 }],
        });

        expect(plan[0].mode).toBe('enhanced');
        expect(plan[0].checkpoints[0].name).toBe('Silver Springs Lake');
        expect(plan[0].checkpoints[0].type).toBe('visual_checkpoint');
        expect(plan[0].checkpoints[0].source).toBe('curated_visual_checkpoint');
    });
});
