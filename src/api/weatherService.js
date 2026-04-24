/**
 * Fetches the latest METAR and TAF for a given ICAO code.
 * 
 * @param {string} icao - The ICAO airport code.
 * @returns {Promise<Object>} { temperature, altimeter, windSpeed, windDirection, forecast: { temperature, windSpeed, windDirection } }
 */
export async function getWeatherData(icao) {
    console.log(`[getWeatherData] START for ${icao}`);
    const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`;
    
    try {
        console.log(`[getWeatherData] Fetching METAR from: ${metarUrl}`);
        const response = await fetch(metarUrl);
        
        if (!response.ok) {
            console.error(`[getWeatherData] METAR Fetch Failed: ${response.status}`);
            throw new Error(`METAR API returned ${response.status}`);
        }
        
        const metarData = await response.json();
        console.log(`[getWeatherData] METAR Data Received: ${JSON.stringify(metarData).substring(0, 100)}`);
        
        const metar = Array.isArray(metarData) ? metarData[0] : metarData;
        if (!metar || (Array.isArray(metarData) && metarData.length === 0)) {
            console.warn(`[getWeatherData] No METAR found for ${icao}`);
            throw new Error(`No METAR found for ${icao}`);
        }

        let altimeter = metar.altim;
        if (altimeter > 50) { 
            altimeter = altimeter / 33.8639;
        }

        const result = {
            temperature: metar.temp,
            altimeter: Number(altimeter.toFixed(2)),
            windSpeed: metar.wspd,
            windDirection: metar.wdir,
            elevation: Math.round(metar.elev * 3.28084), // Convert meters to feet
            lat: metar.lat,
            lon: metar.lon,
            forecast: null
        };
        
        console.log(`[getWeatherData] SUCCESS for ${icao}`);
        return result;
    } catch (error) {
        console.error(`[getWeatherData] CRITICAL ERROR for ${icao}:`, error);
        throw error;
    }
}
