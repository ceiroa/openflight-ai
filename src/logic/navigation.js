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
function calculateWindTriangle(trueCourse, trueAirspeed, windDirection, windSpeed) {
    const tcRad = (trueCourse * Math.PI) / 180;
    const wdRad = (windDirection * Math.PI) / 180;
    
    // The angle between the wind direction and the true course
    // Note: windDirection is where it's coming FROM. 
    // The wind vector angle in the triangle is (windDirection + 180) - trueCourse.
    const windAngle = wdRad - tcRad;

    // Law of Sines: sin(WCA) / windSpeed = sin(windAngle) / trueAirspeed
    // sin(WCA) = (windSpeed / trueAirspeed) * sin(windAngle)
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

module.exports = {
    calculateWindTriangle
};
