/**
 * Fetches the latest METAR for a given ICAO code from AviationWeather.gov
 * 
 * @param {string} icao - The ICAO airport code (e.g., 'KLOT').
 * @returns {Promise<Object>} { temperature, altimeter }
 */
export async function fetchWeather(icao) {
    const url = `https://www.aviationweather.gov/api/data/metar?ids=${icao}&format=json`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Weather data not available');
        
        const data = await response.json();
        if (!data || data.length === 0) throw new Error('No METAR found for this airport');
        
        const metar = data[0];
        
        let altim = metar.altim;
        if (altim > 50) altim = altim / 33.8639;

        return {
            temperature: metar.temp, // Celsius
            altimeter: Number(altim.toFixed(2)), // inHg
            elevation: metar.elev // feet
        };
    } catch (error) {
        console.error('Error fetching weather:', error);
        throw error;
    }
}
