import { calculateWindTriangle } from '../src/logic/navigation.js';

describe('calculateWindTriangle', () => {
    // 1. A no-wind scenario
    test('Calculates correctly for a no-wind scenario', () => {
        const trueCourse = 0; // North
        const trueAirspeed = 100; // 100 knots
        const windDirection = 0; // Wind from North
        const windSpeed = 0; // 0 knots wind

        const result = calculateWindTriangle(trueCourse, trueAirspeed, windDirection, windSpeed);

        expect(result.windCorrectionAngle).toBe(0);
        expect(result.groundspeed).toBe(100);
    });

    // 2. A direct headwind
    test('Calculates correctly for a direct headwind', () => {
        const trueCourse = 0; // North
        const trueAirspeed = 100; // 100 knots
        const windDirection = 0; // Wind from North (direct headwind)
        const windSpeed = 20; // 20 knots wind

        const result = calculateWindTriangle(trueCourse, trueAirspeed, windDirection, windSpeed);

        expect(result.windCorrectionAngle).toBe(0);
        expect(result.groundspeed).toBe(80);
    });

    // 3. A 90-degree crosswind
    test('Calculates correctly for a 90-degree crosswind', () => {
        const trueCourse = 90; // East
        const trueAirspeed = 100; // 100 knots
        const windDirection = 0; // Wind from North (90-degree crosswind from the left)
        const windSpeed = 20; // 20 knots wind

        // Standard E6B calculation for:
        // TC 090, TAS 100, Wind 000/20
        // WCA = asin(20/100 * sin(-90)) = asin(-0.2) ≈ -11.537 degrees
        // GS = TAS * cos(WCA) - WS * cos(-90) = 100 * cos(-11.537) - 20 * 0 ≈ 97.979 knots
        
        const result = calculateWindTriangle(trueCourse, trueAirspeed, windDirection, windSpeed);

        expect(result.windCorrectionAngle).toBe(-11.5);
        expect(result.groundspeed).toBe(98);
    });
});

import { calculateClimb } from '../src/logic/navigation.js';

describe('calculateClimb', () => {
    const climbTable = [
        { altitude_ft: 0, speed_kts: 67, rate_of_climb_fpm: 900 },
        { altitude_ft: 2000, speed_kts: 65, rate_of_climb_fpm: 780 },
        { altitude_ft: 4000, speed_kts: 64, rate_of_climb_fpm: 660 },
        { altitude_ft: 6000, speed_kts: 63, rate_of_climb_fpm: 540 }
    ];

    test('interpolates climb rate correctly at sea level (ISA)', () => {
        // ISA sea level: Temp 15C, Altimeter 29.92
        const result = calculateClimb(2000, 0, 15, 29.92, climbTable);
        
        // Average alt = 1000ft. 
        // Pressure Alt = 1000 + (29.92 - 29.92) * 1000 = 1000ft.
        // ISA Temp at 1000ft = 15 - (1000/1000)*2 = 13C.
        // Density Alt = 1000 + 120 * (15 - 13) = 1000 + 240 = 1240ft.
        // Interpolation between 0 (900) and 2000 (780):
        // 900 + (1240 - 0) * (780 - 900) / (2000 - 0)
        // 900 + 1240 * (-120) / 2000 = 900 - 1240 * 0.06 = 900 - 74.4 = 825.6 -> 826 fpm.
        
        expect(result.rateOfClimb).toBe(826);
        // Time = 2000 / 826 = 2.42 -> 2.4 min
        expect(result.timeMinutes).toBe(2.4);
    });
});

