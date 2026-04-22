/**
 * Fetches the latest METAR and TAF for a given ICAO code.
 * 
 * @param {string} icao - The ICAO airport code.
 * @returns {Promise<Object>} { temperature, altimeter, windSpeed, windDirection, forecast: { temperature, windSpeed, windDirection } }
 */
export async function getWeatherData(icao) {
    const metarUrl = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`;
    const tafUrl = `https://aviationweather.gov/api/data/taf?ids=${icao}&format=json`;
    
    try {
        const [metarRes, tafRes] = await Promise.all([
            fetch(metarUrl),
            fetch(tafUrl)
        ]);

        if (!metarRes.ok) throw new Error(`METAR API returned ${metarRes.status}`);
        
        const metarData = await metarRes.json();
        const metar = Array.isArray(metarData) ? metarData[0] : metarData;
        
        if (!metar) throw new Error('No METAR found for this airport');

        // Altimeter from AviationWeather JSON is in hPa. Convert to inHg: 1 inHg = 33.8639 hPa
        const altimeterInHg = metar.altim / 33.8639;

        const result = {
            temperature: metar.temp,
            altimeter: Number(altimeterInHg.toFixed(2)),
            windSpeed: metar.wspd,
            windDirection: metar.wdir,
            forecast: null
        };

        if (tafRes.ok) {
            const tafData = await tafRes.json();
            const taf = Array.isArray(tafData) ? tafData[0] : tafData;
            if (taf && taf.fcsts && taf.fcsts.length > 0) {
                // Simplified: use the first forecast period
                const f = taf.fcsts[0];
                result.forecast = {
                    windSpeed: f.wspd,
                    windDirection: f.wdir,
                    // TAFs rarely have temp, but we include it if present
                    temperature: f.temp !== undefined ? f.temp : metar.temp 
                };
            }
        }
        
        return result;
    } catch (error) {
        console.error(`Error fetching weather for ${icao}:`, error);
        throw error;
    }
}
