const METAR_BASE_URL = 'https://aviationweather.gov/api/data/metar';
const STATION_INFO_BASE_URL = 'https://aviationweather.gov/api/data/stationinfo';
const AIRPORT_INFO_BASE_URL = 'https://aviationweather.gov/api/data/airport';

export async function getWeatherData(icao) {
    const metarUrl = `${METAR_BASE_URL}?ids=${icao}&format=json`;

    const metar = await fetchFirstRecord(metarUrl, `METAR API`);
    if (!metar) {
        throw new Error(`No METAR found for ${icao}`);
    }

    let altimeter = metar.altim;
    if (altimeter > 50) {
        altimeter = altimeter / 33.8639;
    }

    if (![metar.temp, altimeter, metar.wspd].every((value) => Number.isFinite(Number(value)))) {
        throw new Error(`Incomplete weather data returned for ${icao}`);
    }

    const location = await resolveLocationData(icao, metar);

    return {
        temperature: metar.temp,
        altimeter: Number(altimeter.toFixed(2)),
        windSpeed: metar.wspd,
        windDirection: metar.wdir ?? 0,
        elevation: location.elevation,
        lat: location.lat,
        lon: location.lon,
        forecast: null,
    };
}

async function resolveLocationData(icao, metar) {
    const metarLocation = normalizeLocationRecord(metar);
    if (metarLocation) {
        return metarLocation;
    }

    const stationInfo = await fetchFirstRecord(
        `${STATION_INFO_BASE_URL}?ids=${icao}&format=json`,
        `stationinfo API`
    );
    const stationLocation = normalizeLocationRecord(stationInfo);
    if (stationLocation) {
        return stationLocation;
    }

    const airportInfo = await fetchFirstRecord(
        `${AIRPORT_INFO_BASE_URL}?ids=${icao}&format=json`,
        `airport API`
    );
    const airportLocation = normalizeLocationRecord(airportInfo);
    if (airportLocation) {
        return airportLocation;
    }

    throw new Error(`No airport coordinates found for ${icao}`);
}

function normalizeLocationRecord(record) {
    if (!record) {
        return null;
    }

    const lat = Number(record.lat);
    const lon = Number(record.lon);
    const elev = Number(record.elev);
    if (![lat, lon, elev].every(Number.isFinite)) {
        return null;
    }

    return {
        lat,
        lon,
        elevation: Math.round(elev * 3.28084),
    };
}

async function fetchFirstRecord(url, label) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${label} returned ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data)) {
        return data[0] ?? null;
    }

    if (Array.isArray(data?.value)) {
        return data.value[0] ?? null;
    }

    return data ?? null;
}
