import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    getAircraftProfileById,
    listAircraftProfiles,
    normalizeAircraftProfile,
    saveAircraftProfile,
    validateAircraftProfile,
} from '../../src/aircraftProfiles.js';

describe('aircraft profiles', () => {
    let tempDir;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openflight-aircraft-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('normalizes profile ids and validates completeness', () => {
        const normalized = normalizeAircraftProfile({
            aircraft: 'Cessna 172S',
            manufacturer: 'Cessna',
            model: '172S',
            profiles: {
                climb: {
                    speed_kts: 74,
                    rpm: 2550,
                    fuel_burn_gph: 10.5,
                    rate_of_climb_fpm: 730,
                    climbTable: [{ altitude_ft: 0, speed_kts: 74, rate_of_climb_fpm: 730 }],
                },
                cruise65: {
                    speed_kts: 122,
                    rpm: 2400,
                    fuel_burn_gph: 8.6,
                },
            },
        });

        expect(normalized.id).toBe('cessna-172s');
        expect(validateAircraftProfile(normalized)).toEqual({ complete: true, issues: [] });
    });

    test('saves and reloads a profile from the standardized directory', async () => {
        await saveAircraftProfile({
            id: 'evektor-harmony-lsa',
            aircraft: 'Evektor Harmony LSA',
            manufacturer: 'Evektor',
            model: 'Harmony LSA',
            profiles: {
                climb: {
                    speed_kts: 65,
                    rpm: 5500,
                    fuel_burn_gph: 6.6,
                    rate_of_climb_fpm: 850,
                    climbTable: [{ altitude_ft: 0, speed_kts: 67, rate_of_climb_fpm: 900 }],
                },
                cruise65: {
                    speed_kts: 93,
                    rpm: 4800,
                    fuel_burn_gph: 4.3,
                },
            },
        }, tempDir);

        const profiles = await listAircraftProfiles(tempDir);
        expect(profiles).toHaveLength(1);
        expect(profiles[0]).toMatchObject({
            id: 'evektor-harmony-lsa',
            aircraft: 'Evektor Harmony LSA',
            complete: true,
        });

        const loaded = await getAircraftProfileById('evektor-harmony-lsa', tempDir);
        expect(loaded.aircraft).toBe('Evektor Harmony LSA');
        expect(loaded.profiles.climb.climbTable).toHaveLength(1);
    });

    test('marks incomplete profiles in the list summary', async () => {
        await saveAircraftProfile({
            id: 'incomplete-aircraft',
            aircraft: 'Incomplete Aircraft',
            profiles: {
                climb: {
                    speed_kts: 60,
                    rpm: 5000,
                    fuel_burn_gph: 5.5,
                    rate_of_climb_fpm: 600,
                    climbTable: [],
                },
            },
        }, tempDir);

        const profiles = await listAircraftProfiles(tempDir);
        expect(profiles[0].complete).toBe(false);
        expect(profiles[0].issues).toContain('Cruise profile is required.');
        expect(profiles[0].issues).toContain('Climb table is required.');
    });
});
