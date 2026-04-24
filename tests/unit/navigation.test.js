import { calculateClimb, calculatePressureAltitude, calculateWindTriangle } from '../../src/logic/navigation.js';

describe('calculateWindTriangle', () => {
    test('calculates correctly for a no-wind scenario', () => {
        const result = calculateWindTriangle(0, 100, 0, 0);

        expect(result.windCorrectionAngle).toBe(0);
        expect(result.groundspeed).toBe(100);
    });

    test('calculates correctly for a direct headwind', () => {
        const result = calculateWindTriangle(0, 100, 0, 20);

        expect(result.windCorrectionAngle).toBe(0);
        expect(result.groundspeed).toBe(80);
    });

    test('calculates correctly for a 90-degree crosswind', () => {
        const result = calculateWindTriangle(90, 100, 0, 20);

        expect(result.windCorrectionAngle).toBe(-11.5);
        expect(result.groundspeed).toBe(98);
    });

    test('throws when the wind makes the requested course impossible', () => {
        expect(() => calculateWindTriangle(90, 60, 0, 80)).toThrow('Wind speed is too high');
    });
});

describe('calculateClimb', () => {
    const climbTable = [
        { altitude_ft: 0, speed_kts: 67, rate_of_climb_fpm: 900 },
        { altitude_ft: 2000, speed_kts: 65, rate_of_climb_fpm: 780 },
        { altitude_ft: 4000, speed_kts: 64, rate_of_climb_fpm: 660 },
        { altitude_ft: 6000, speed_kts: 63, rate_of_climb_fpm: 540 },
    ];

    test('interpolates climb rate correctly at sea level', () => {
        const result = calculateClimb(2000, 0, 15, 29.92, climbTable);

        expect(result.rateOfClimb).toBe(826);
        expect(result.timeMinutes).toBe(2.4);
    });

    test('calculates pressure altitude from altimeter setting', () => {
        expect(calculatePressureAltitude(4500, 29.72)).toBe(4700);
    });
});
