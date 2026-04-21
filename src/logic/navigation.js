/**
 * Calculates the Wind Correction Angle (WCA) and Groundspeed.
 * 
 * Uses the Law of Sines to solve the wind triangle.
 * 
 * @param {number} trueCourse - The desired track over the ground (degrees).
 * @param {number} trueAirspeed - The speed of the aircraft through the air (knots).
 * @param {number} windDirection - The direction the wind is coming FROM (degrees).
 * @param {number} windSpeed - The speed of the wind (knots).
 * @returns {Object} { windCorrectionAngle, groundspeed }
 *                   windCorrectionAngle is in degrees (positive = right correction).
 *                   groundspeed is in knots.
 */
export function calculateWindTriangle(trueCourse, trueAirspeed, windDirection, windSpeed) {
    const tcRad = (trueCourse * Math.PI) / 180;
    const wdRad = (windDirection * Math.PI) / 180;
    
    // The angle between the wind direction and the true course
    // Note: windDirection is where it's coming FROM. 
    // The wind vector angle in the triangle is (windDirection + 180) - trueCourse.
    const windAngle = wdRad - tcRad;

    // Law of Sines: sin(WCA) / windSpeed = sin(windAngle) / trueAirspeed
    // sin(WCA) = (windSpeed / trueAirspeed) * Math.sin(windAngle)
    const sinWCA = (windSpeed / trueAirspeed) * Math.sin(windAngle);
    
    // Check for impossible flight conditions (wind too strong)
    if (Math.abs(sinWCA) > 1) {
        throw new Error("Wind speed is too high for the given airspeed to maintain course.");
    }

    const wcaRad = Math.asin(sinWCA);
    const wcaDeg = (wcaRad * 180) / Math.PI;

    // Groundspeed calculation using Law of Sines or Law of Cosines
    // Using: gs / sin(180 - windAngle - WCA) = tas / sin(windAngle) is tricky due to sign conventions.
    // Using Law of Cosines: gs = sqrt(tas^2 + ws^2 - 2*tas*ws*cos(alpha)) 
    // where alpha is angle between heading and wind.
    // Alternatively, using the triangle properties:
    const groundspeed = trueAirspeed * Math.cos(wcaRad) - windSpeed * Math.cos(windAngle);

    return {
        windCorrectionAngle: Math.round(wcaDeg * 10) / 10,
        groundspeed: Math.round(groundspeed * 10) / 10
    };
}

/**
 * Calculates Pressure Altitude.
 * 
 * @param {number} altitude - Indicated altitude (feet).
 * @param {number} altimeterSetting - Current altimeter setting (inHg).
 * @returns {number} Pressure Altitude (feet).
 */
export function calculatePressureAltitude(altitude, altimeterSetting) {
    return Math.round(altitude + (29.92 - altimeterSetting) * 1000);
}

/**
 * Calculates Density Altitude.
 * 
 * @param {number} pressureAltitude - Pressure Altitude (feet).
 * @param {number} temperature - Outside Air Temperature (Celsius).
 * @returns {number} Density Altitude (feet).
 */
export function calculateDensityAltitude(pressureAltitude, temperature) {
    const isaTemperature = 15 - (pressureAltitude / 1000) * 2;
    return Math.round(pressureAltitude + 120 * (temperature - isaTemperature));
}

/**
 * Calculates Time to Climb.
 * 
 * @param {number} altToReach - Target altitude (feet).
 * @param {number} airportAlt - Departure altitude (feet).
 * @param {number} climbRate - Rate of climb (fpm).
 * @returns {number} Time to climb (minutes).
 */
export function calculateTimeToClimb(altToReach, airportAlt, climbRate) {
    if (climbRate <= 0) {
        throw new Error("Climb rate must be greater than zero.");
    }
    return Math.round(((altToReach - airportAlt) / climbRate) * 10) / 10;
}

/**
 * Calculates the interpolated rate of climb for a given altitude.
 * 
 * @param {number} altitude - Altitude (feet).
 * @param {Array} climbTable - Array of objects { altitude_ft, rate_of_climb_fpm }.
 * @returns {number} Rate of climb (fpm).
 */
export function getClimbRateForAlt(altitude, climbTable) {
    if (!climbTable || climbTable.length === 0) {
        throw new Error("Climb table is missing or empty.");
    }

    // Sort table by altitude just in case
    const sortedTable = [...climbTable].sort((a, b) => a.altitude_ft - b.altitude_ft);

    // Handle out of bounds
    if (altitude <= sortedTable[0].altitude_ft) return sortedTable[0].rate_of_climb_fpm;
    if (altitude >= sortedTable[sortedTable.length - 1].altitude_ft) return sortedTable[sortedTable.length - 1].rate_of_climb_fpm;

    // Find the two points to interpolate between
    for (let i = 0; i < sortedTable.length - 1; i++) {
        const p1 = sortedTable[i];
        const p2 = sortedTable[i + 1];

        if (altitude >= p1.altitude_ft && altitude <= p2.altitude_ft) {
            // Linear interpolation: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
            const rate = p1.rate_of_climb_fpm + (altitude - p1.altitude_ft) * (p2.rate_of_climb_fpm - p1.rate_of_climb_fpm) / (p2.altitude_ft - p1.altitude_ft);
            return Math.round(rate);
        }
    }

    return sortedTable[sortedTable.length - 1].rate_of_climb_fpm;
}

/**
 * Calculates complete climb performance using Density Altitude for lookup.
 * 
 * @param {number} altToReach - Target altitude (feet).
 * @param {number} airportAlt - Departure altitude (feet).
 * @param {number} temperature - Outside Air Temperature at average altitude (Celsius).
 * @param {number} altimeterSetting - Current altimeter setting (inHg).
 * @param {Array} climbTable - Climb performance table.
 * @returns {Object} { timeMinutes, rateOfClimb, densityAltitude }
 */
export function calculateClimb(altToReach, airportAlt, temperature, altimeterSetting, climbTable) {
    // 1. Find the average altitude for the climb
    const averageAlt = (altToReach + airportAlt) / 2;

    // 2. Calculate Pressure Altitude at that average altitude
    const pressureAlt = calculatePressureAltitude(averageAlt, altimeterSetting);

    // 3. Calculate Density Altitude based on Temperature and Pressure Altitude
    const densityAlt = calculateDensityAltitude(pressureAlt, temperature);
    
    // 4. Use Density Altitude to look up the performance rate from the table
    const climbRate = getClimbRateForAlt(densityAlt, climbTable);
    
    const time = calculateTimeToClimb(altToReach, airportAlt, climbRate);
    
    return {
        timeMinutes: time,
        rateOfClimb: climbRate,
        densityAltitude: densityAlt
    };
}


