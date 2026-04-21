const { calculateWindTriangle } = require('./src/logic/navigation');

// Test Case: 
// True Course: 090 (East)
// True Airspeed: 120 knots
// Wind: 180 (South) at 20 knots
const tc = 90;
const tas = 120;
const wd = 180;
const ws = 20;

console.log(`--- OpenFlight-AI Navigation Test ---`);
console.log(`True Course: ${tc}°`);
console.log(`True Airspeed: ${tas} kts`);
console.log(`Wind: ${wd}° @ ${ws} kts`);

try {
    const result = calculateWindTriangle(tc, tas, wd, ws);
    console.log(`\nResults:`);
    console.log(`Wind Correction Angle: ${result.windCorrectionAngle}°`);
    console.log(`True Heading: ${tc + result.windCorrectionAngle}°`);
    console.log(`Groundspeed: ${result.groundspeed} kts`);
} catch (error) {
    console.error(`Error: ${error.message}`);
}
