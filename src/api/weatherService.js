import { magvar } from 'magvar';
import { findAirportInReferenceData } from './airportReferenceService.js';

const METAR_BASE_URL = 'https://aviationweather.gov/api/data/metar';
const TAF_BASE_URL = 'https://aviationweather.gov/api/data/taf';
const STATION_INFO_BASE_URL = 'https://aviationweather.gov/api/data/stationinfo';
const AIRPORT_INFO_BASE_URL = 'https://aviationweather.gov/api/data/airport';
const STATIONS_CACHE_URL = 'https://aviationweather.gov/data/cache/stations.cache.json.gz';
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const MAX_FETCH_ATTEMPTS = 3;

let stationCachePromise;

export async function getWeatherData(icao, options = {}) {
    const requestedTime = parseRequestedTime(options.datetime);
    if (requestedTime && requestedTime.getTime() > Date.now() + 60000) {
        return getForecastWeatherData(icao, requestedTime);
    }

    return getObservedWeatherData(icao);
}

async function getObservedWeatherData(icao) {
    const metarUrl = `${METAR_BASE_URL}?ids=${icao}&format=json`;

    const metar = await fetchFirstRecord(metarUrl, `METAR API`, { allowNoContent: true });
    if (!metar) {
        return getNearestStationWeather(icao);
    }

    let altimeter = metar.altim;
    if (altimeter > 50) {
        altimeter = altimeter / 33.8639;
    }

    if (![metar.temp, altimeter, metar.wspd].every((value) => Number.isFinite(Number(value)))) {
        throw new Error(`Incomplete weather data returned for ${icao}`);
    }

    const location = await resolveLocationData(icao, metar);
    const variation = calculateMagneticVariation(location.lat, location.lon, location.elevation);

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

async function getForecastWeatherData(icao, requestedTime) {
    const [taf, latestMetar] = await Promise.all([
        fetchFirstRecord(`${TAF_BASE_URL}?ids=${icao}&format=json`, 'TAF API', { allowNoContent: true }),
        fetchFirstRecord(`${METAR_BASE_URL}?ids=${icao}&format=json`, 'METAR API', { allowNoContent: true }),
    ]);

    if (!taf) {
        throw new Error(`No FAA forecast data is available for ${icao} at the selected date and time.`);
    }

    const forecastSegment = selectTafForecastSegment(taf, requestedTime);
    if (!forecastSegment) {
        throw new Error(`No FAA forecast data is available for ${icao} at the selected date and time. TAF coverage is usually limited to about 24 to 30 hours.`);
    }

    const location = latestMetar
        ? await resolveLocationData(icao, latestMetar)
        : await resolveAirportLocationWithoutMetar(icao);
    const altimeter = normalizeAltimeter(latestMetar?.altim);
    if (!Number.isFinite(altimeter)) {
        throw new Error(`Forecast data is available for ${icao}, but no current altimeter setting is available to support the nav log calculations.`);
    }

    const temperature = extractFirstFiniteNumber(
        forecastSegment,
        ['temp', 'tempC', 'temperature', 'temperatureC', 'airTemp'],
    );
    const windSpeed = extractFirstFiniteNumber(
        forecastSegment,
        ['wspd', 'windSpeed', 'wind_speed_kt', 'speed', 'spd'],
    );
    const windDirection = extractFirstFiniteNumber(
        forecastSegment,
        ['wdir', 'windDirection', 'wind_dir_degrees', 'direction', 'dir'],
        0,
    );

    if (![temperature, windSpeed].every(Number.isFinite)) {
        throw new Error(`Incomplete forecast data returned for ${icao} at the selected date and time.`);
    }

    const variation = calculateMagneticVariation(location.lat, location.lon, location.elevation);

    return {
        temperature,
        altimeter: Number(altimeter.toFixed(2)),
        windSpeed,
        windDirection,
        elevation: location.elevation,
        lat: location.lat,
        lon: location.lon,
        variation,
        forecast: {
            isForecast: true,
            source: 'TAF',
            requestedTime: requestedTime.toISOString(),
            validFrom: extractDateValue(forecastSegment, ['fcstTimeFrom', 'startTime', 'validTimeFrom', 'timeFrom'])?.toISOString() || null,
            validTo: extractDateValue(forecastSegment, ['fcstTimeTo', 'endTime', 'validTimeTo', 'timeTo'])?.toISOString() || null,
            message: `Forecast loaded for ${icao}. Wind and temperature come from the FAA TAF; altimeter uses the latest available observation.`,
        },
    };
}

async function getNearestStationWeather(icao) {
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

    const variation = calculateMagneticVariation(airportLocation.lat, airportLocation.lon, airportLocation.elevation);

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

function calculateMagneticVariation(lat, lon, elevationFeet = 0) {
    const altitudeKm = Number.isFinite(elevationFeet) ? elevationFeet / 3280.84 : 0;
    return Math.round(magvar(lat, lon, altitudeKm) * 100) / 100;
}

function parseRequestedTime(value) {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeAltimeter(value) {
    if (!Number.isFinite(Number(value))) {
        return null;
    }

    let altimeter = Number(value);
    if (altimeter > 50) {
        altimeter = altimeter / 33.8639;
    }

    return altimeter;
}

function selectTafForecastSegment(taf, requestedTime) {
    const forecastSegments = []
        .concat(taf)
        .concat(Array.isArray(taf?.fcsts) ? taf.fcsts : [])
        .filter(Boolean);

    const match = forecastSegments.find((segment) => {
        const start = extractDateValue(segment, ['fcstTimeFrom', 'startTime', 'validTimeFrom', 'timeFrom']);
        const end = extractDateValue(segment, ['fcstTimeTo', 'endTime', 'validTimeTo', 'timeTo']);
        if (!start || !end) {
            return false;
        }

        return requestedTime >= start && requestedTime <= end;
    });

    return match ?? null;
}

function extractDateValue(record, keys) {
    for (const key of keys) {
        const value = record?.[key];
        if (!value) {
            continue;
        }

        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime())) {
            return parsed;
        }
    }

    return null;
}

function extractFirstFiniteNumber(record, keys, fallback = null) {
    for (const key of keys) {
        const value = Number(record?.[key]);
        if (Number.isFinite(value)) {
            return value;
        }
    }

    return fallback;
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
    const response = await fetchWithRetry(url, label);
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

async function fetchWithRetry(url, label) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.ok || response.status === 204 || !RETRYABLE_STATUS_CODES.has(response.status) || attempt === MAX_FETCH_ATTEMPTS) {
                return response;
            }

            lastError = new Error(`${label} returned ${response.status}`);
        } catch (error) {
            lastError = error;
            if (attempt === MAX_FETCH_ATTEMPTS) {
                throw error;
            }
        }
    }

    throw lastError ?? new Error(`${label} request failed`);
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
        stationCachePromise = fetchWithRetry(STATIONS_CACHE_URL, 'stations cache')
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
