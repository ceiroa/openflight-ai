const METAR_BASE_URL = 'https://aviationweather.gov/api/data/metar';
const STATION_INFO_BASE_URL = 'https://aviationweather.gov/api/data/stationinfo';
const AIRPORT_INFO_BASE_URL = 'https://aviationweather.gov/api/data/airport';
const STATIONS_CACHE_URL = 'https://aviationweather.gov/data/cache/stations.cache.json.gz';
const AIRPORTS_CSV_URL = 'https://ourairports.com/data/airports.csv';
const NOAA_DECLINATION_BASE_URL = 'https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination';
const DEFAULT_NOAA_GEOMAG_API_KEY = process.env.NOAA_GEOMAG_API_KEY || 'zNEw7';

let stationCachePromise;
let airportReferencePromise;

export async function getWeatherData(icao, dateString, geomagApiKey) {
    const metarUrl = `${METAR_BASE_URL}?ids=${icao}&format=json`;

    const metar = await fetchFirstRecord(metarUrl, `METAR API`, { allowNoContent: true });
    if (!metar) {
        return getNearestStationWeather(icao, dateString, geomagApiKey);
    }

    let altimeter = metar.altim;
    if (altimeter > 50) {
        altimeter = altimeter / 33.8639;
    }

    if (![metar.temp, altimeter, metar.wspd].every((value) => Number.isFinite(Number(value)))) {
        throw new Error(`Incomplete weather data returned for ${icao}`);
    }

    const location = await resolveLocationData(icao, metar);
    const variation = await fetchMagneticVariation(location.lat, location.lon, dateString, geomagApiKey);

    return {
        temperature: metar.temp,
        altimeter: Number(altimeter.toFixed(2)),
        windSpeed: metar.wspd,
        windDirection: metar.wdir ?? 0,
        elevation: location.elevation,
        lat: location.lat,
        lon: location.lon,
        variation,
        forecast: null,
    };
}

async function getNearestStationWeather(icao, dateString, geomagApiKey) {
    const airportLocation = await resolveAirportLocationWithoutMetar(icao);
    const nearestStation = await findNearestMetarStation(airportLocation.lat, airportLocation.lon);
    if (!nearestStation?.icaoId) {
        throw new Error(`No nearby METAR station found for ${icao}`);
    }

    const nearestMetar = await fetchFirstRecord(
        `${METAR_BASE_URL}?ids=${nearestStation.icaoId}&format=json`,
        `METAR API`
    );

    if (!nearestMetar) {
        throw new Error(`No METAR found for nearby station ${nearestStation.icaoId}`);
    }

    let altimeter = nearestMetar.altim;
    if (altimeter > 50) {
        altimeter = altimeter / 33.8639;
    }

    if (![nearestMetar.temp, altimeter, nearestMetar.wspd].every((value) => Number.isFinite(Number(value)))) {
        throw new Error(`Incomplete weather data returned for nearby station ${nearestStation.icaoId}`);
    }

    const variation = await fetchMagneticVariation(airportLocation.lat, airportLocation.lon, dateString, geomagApiKey);

    return {
        temperature: nearestMetar.temp,
        altimeter: Number(altimeter.toFixed(2)),
        windSpeed: nearestMetar.wspd,
        windDirection: nearestMetar.wdir ?? 0,
        elevation: airportLocation.elevation,
        lat: airportLocation.lat,
        lon: airportLocation.lon,
        variation,
        forecast: null,
        weatherSourceIcao: nearestStation.icaoId,
    };
}

async function fetchMagneticVariation(lat, lon, dateString, geomagApiKey) {
    const date = parseVariationDate(dateString);
    const url = new URL(NOAA_DECLINATION_BASE_URL);
    url.searchParams.set('lat1', String(lat));
    url.searchParams.set('lon1', String(lon));
    url.searchParams.set('model', 'WMM');
    url.searchParams.set('startYear', String(date.getUTCFullYear()));
    url.searchParams.set('startMonth', String(date.getUTCMonth() + 1));
    url.searchParams.set('startDay', String(date.getUTCDate()));
    url.searchParams.set('resultFormat', 'json');
    url.searchParams.set('key', geomagApiKey || DEFAULT_NOAA_GEOMAG_API_KEY);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`NOAA declination API returned ${response.status}`);
    }

    const bodyText = await response.text();
    if (!bodyText || !bodyText.trim()) {
        throw new Error('NOAA declination API returned an empty response');
    }

    const payload = JSON.parse(bodyText);
    const declination = Number(payload?.result?.[0]?.declination);
    if (!Number.isFinite(declination)) {
        throw new Error('NOAA declination API returned no declination value');
    }

    return Math.round(declination * 100) / 100;
}

function parseVariationDate(dateString) {
    if (!dateString) {
        return new Date();
    }

    const parsed = new Date(`${dateString}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
        return new Date();
    }

    return parsed;
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

async function resolveAirportLocationWithoutMetar(icao) {
    const directLocation = await resolveLocationDataFromSources(icao);
    if (directLocation) {
        return directLocation;
    }

    const alternateIds = getAlternateAirportIds(icao);
    for (const alternateId of alternateIds) {
        const alternateLocation = await resolveLocationDataFromSources(alternateId);
        if (alternateLocation) {
            return alternateLocation;
        }
    }

    const referenceAirport = await findAirportInReferenceData([icao, ...alternateIds]);
    if (referenceAirport) {
        return referenceAirport;
    }

    throw new Error(`No airport coordinates found for ${icao}`);
}

async function resolveLocationDataFromSources(icao) {
    const stationInfo = await fetchFirstRecord(
        `${STATION_INFO_BASE_URL}?ids=${icao}&format=json`,
        `stationinfo API`,
        { allowNoContent: true }
    );
    const stationLocation = normalizeLocationRecord(stationInfo);
    if (stationLocation) {
        return stationLocation;
    }

    const airportInfo = await fetchFirstRecord(
        `${AIRPORT_INFO_BASE_URL}?ids=${icao}&format=json`,
        `airport API`,
        { allowNoContent: true }
    );
    return normalizeLocationRecord(airportInfo);
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

async function fetchFirstRecord(url, label, options = {}) {
    const response = await fetch(url);
    if (response.status === 204 && options.allowNoContent) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`${label} returned ${response.status}`);
    }

    let data;
    if (typeof response.text === 'function') {
        const rawBody = await response.text();
        if (!rawBody || !rawBody.trim()) {
            return null;
        }
        data = JSON.parse(rawBody);
    } else if (typeof response.json === 'function') {
        data = await response.json();
    } else {
        throw new Error(`${label} returned an unreadable response body`);
    }

    if (Array.isArray(data)) {
        return data[0] ?? null;
    }

    if (Array.isArray(data?.value)) {
        return data.value[0] ?? null;
    }

    return data ?? null;
}

function getAlternateAirportIds(icao) {
    const normalized = icao.trim().toUpperCase();
    const alternatives = [];

    if (normalized.startsWith('K') && normalized.length === 4) {
        alternatives.push(normalized.slice(1));
    }

    return alternatives;
}

async function findNearestMetarStation(lat, lon) {
    const stations = await loadMetarStations();
    let nearestStation = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const station of stations) {
        const distance = calculateDistanceNm(lat, lon, Number(station.lat), Number(station.lon));
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestStation = station;
        }
    }

    return nearestStation;
}

async function loadMetarStations() {
    if (!stationCachePromise) {
        stationCachePromise = fetch(STATIONS_CACHE_URL)
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`stations cache returned ${response.status}`);
                }

                const compressed = Buffer.from(await response.arrayBuffer());
                const { gunzipSync } = await import('node:zlib');
                const parsed = JSON.parse(gunzipSync(compressed).toString('utf8'));
                return parsed
                    .filter((station) => Array.isArray(station.siteType) && station.siteType.includes('METAR'))
                    .filter((station) => station.icaoId && Number.isFinite(Number(station.lat)) && Number.isFinite(Number(station.lon)));
            });
    }

    return stationCachePromise;
}

async function findAirportInReferenceData(candidateIds) {
    const airports = await loadAirportReferenceData();
    const normalizedIds = new Set(candidateIds.map((id) => id.trim().toUpperCase()));

    for (const airport of airports) {
        if (normalizedIds.has(airport.ident) || normalizedIds.has(airport.gpsCode) || normalizedIds.has(airport.localCode)) {
            return airport;
        }
    }

    return null;
}

async function loadAirportReferenceData() {
    if (!airportReferencePromise) {
        airportReferencePromise = fetch(AIRPORTS_CSV_URL)
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`airport reference data returned ${response.status}`);
                }

                const csv = await response.text();
                return parseAirportReferenceCsv(csv);
            });
    }

    return airportReferencePromise;
}

function parseAirportReferenceCsv(csv) {
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
        return [];
    }

    const headers = parseCsvLine(lines[0]);
    const indexByName = Object.fromEntries(headers.map((header, index) => [header, index]));
    const airports = [];

    for (const line of lines.slice(1)) {
        const values = parseCsvLine(line);
        const latitude = Number(values[indexByName.latitude_deg]);
        const longitude = Number(values[indexByName.longitude_deg]);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            continue;
        }

        const elevationFeet = Number(values[indexByName.elevation_ft]);
        airports.push({
            ident: (values[indexByName.ident] || '').toUpperCase(),
            gpsCode: (values[indexByName.gps_code] || '').toUpperCase(),
            localCode: (values[indexByName.local_code] || '').toUpperCase(),
            lat: latitude,
            lon: longitude,
            elevation: Number.isFinite(elevationFeet) ? Math.round(elevationFeet) : 0,
        });
    }

    return airports;
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const nextChar = line[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current);
    return values;
}

function calculateDistanceNm(lat1, lon1, lat2, lon2) {
    const radiusNm = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radiusNm * c;
}
