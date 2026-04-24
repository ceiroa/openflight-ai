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
export * from "../../public/js/navigation.js";


