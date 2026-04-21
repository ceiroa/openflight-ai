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

