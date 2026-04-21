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
