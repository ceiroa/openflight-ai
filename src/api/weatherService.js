import { magvar } from 'magvar';
import { findAirportInReferenceData } from './airportReferenceService.js';

const METAR_BASE_URL = 'https://aviationweather.gov/api/data/metar';
const TAF_BASE_URL = 'https://aviationweather.gov/api/data/taf';
const STATION_INFO_BASE_URL = 'https://aviationweather.gov/api/data/stationinfo';
const AIRPORT_INFO_BASE_URL = 'https://aviationweather.gov/api/data/airport';
const STATIONS_CACHE_URL = 'https://aviationweather.gov/data/cache/stations.cache.json.gz';
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const MAX_FETCH_ATTEMPTS = 3;
const FUTURE_TIME_TOLERANCE_MS = 60 * 1000;
const METAR_COVERAGE_AFTER_OBSERVATION_MS = 90 * 60 * 1000;
const METAR_COVERAGE_BEFORE_OBSERVATION_MS = 15 * 60 * 1000;
const MAX_NEAREST_TAF_DISTANCE_NM = 75;
const MAX_NEAREST_TAF_CANDIDATES = 8;

let stationCachePromise;
let metarStationCachePromise;
let tafStationCachePromise;
const AREA_WEATHER_CONCURRENCY = 6;
const MAX_AREA_WEATHER_STATIONS = 24;

export async function getWeatherData(icao, options = {}) {
    const requestedTime = parseRequestedTime(options.datetime);
    const isFutureRequest = requestedTime && requestedTime.getTime() > Date.now() + FUTURE_TIME_TOLERANCE_MS;
    if (isFutureRequest) {
        const metar = await fetchFirstRecord(`${METAR_BASE_URL}?ids=${icao}&format=json`, `METAR API`, { allowNoContent: true });
        if (metar && isRequestedTimeCoveredByMetar(metar, requestedTime)) {
            return buildObservedWeatherData(icao, metar);
        }

        return getForecastWeatherData(icao, requestedTime, metar);
    }

    return getObservedWeatherData(icao);
}

export async function getWeatherStationsInBounds(bounds, options = {}) {
    const normalizedBounds = normalizeBounds(bounds);
    const stations = await loadMetarStations();
    const stationsInBounds = stations.filter((station) => {
        const lat = Number(station.lat);
        const lon = Number(station.lon);
        return lat >= normalizedBounds.minLat
            && lat <= normalizedBounds.maxLat
            && lon >= normalizedBounds.minLon
            && lon <= normalizedBounds.maxLon;
    });

    const limitedStations = stationsInBounds
        .sort((left, right) => {
            const leftLat = Number(left.lat);
            const rightLat = Number(right.lat);
            if (leftLat !== rightLat) {
                return rightLat - leftLat;
            }
            return String(left.icaoId).localeCompare(String(right.icaoId));
        })
        .slice(0, MAX_AREA_WEATHER_STATIONS);

    const items = await runWithConcurrency(limitedStations, AREA_WEATHER_CONCURRENCY, async (station) => {
        try {
            const weather = await getWeatherData(station.icaoId, { datetime: options.datetime });
            return {
                icao: station.icaoId,
                name: station.name || station.site,
                lat: Number(station.lat),
                lon: Number(station.lon),
                weather,
            };
        } catch {
            return null;
        }
    });

    return {
        items: items.filter(Boolean),
        totalStationsInBounds: stationsInBounds.length,
        returnedStations: limitedStations.length,
        truncated: stationsInBounds.length > limitedStations.length,
    };
}

export function resetWeatherServiceCachesForTests() {
    stationCachePromise = undefined;
    metarStationCachePromise = undefined;
    tafStationCachePromise = undefined;
}

async function getObservedWeatherData(icao) {
    const metarUrl = `${METAR_BASE_URL}?ids=${icao}&format=json`;

    const metar = await fetchFirstRecord(metarUrl, `METAR API`, { allowNoContent: true });
    if (!metar) {
        return getNearestStationWeather(icao);
    }

    return buildObservedWeatherData(icao, metar);
}

async function buildObservedWeatherData(icao, metar) {
    let altimeter = metar.altim;
    if (altimeter > 50) {
        altimeter = altimeter / 33.8639;
    }

    if (![metar.temp, altimeter, metar.wspd].every((value) => Number.isFinite(Number(value)))) {
        throw new Error(`Incomplete weather data returned for ${icao}`);
    }

    const location = await resolveLocationData(icao, metar);
    const variation = calculateMagneticVariation(location.lat, location.lon, location.elevation);
    const details = extractWeatherDetails(metar);

    return {
        temperature: metar.temp,
        altimeter: Number(altimeter.toFixed(2)),
        windSpeed: metar.wspd,
        windDirection: metar.wdir ?? 0,
        elevation: location.elevation,
        lat: location.lat,
        lon: location.lon,
        variation,
        ...details,
        forecast: null,
    };
}

async function getForecastWeatherData(icao, requestedTime, latestMetar = null) {
    const [taf, metarForAltimeter] = await Promise.all([
        fetchFirstRecord(`${TAF_BASE_URL}?ids=${icao}&format=json`, 'TAF API', { allowNoContent: true }),
        latestMetar
            ? Promise.resolve(latestMetar)
            : fetchFirstRecord(`${METAR_BASE_URL}?ids=${icao}&format=json`, 'METAR API', { allowNoContent: true }),
    ]);

    const location = metarForAltimeter
        ? await resolveLocationData(icao, metarForAltimeter)
        : await resolveAirportLocationWithoutMetar(icao);
    const directForecastSegment = taf ? selectTafForecastSegment(taf, requestedTime) : null;
    const nearestForecast = directForecastSegment || taf
        ? null
        : await findNearestTafForecast(location.lat, location.lon, icao, requestedTime);
    const forecastSegment = directForecastSegment ?? nearestForecast?.segment ?? null;
    const forecastSourceIcao = directForecastSegment ? icao : nearestForecast?.station?.icaoId;

    if (!forecastSegment) {
        throw new Error(`No FAA forecast data is available for ${icao} at the selected date and time. TAF coverage is usually limited to about 24 to 30 hours.`);
    }

    const altimeter = normalizeAltimeter(metarForAltimeter?.altim);
    if (!Number.isFinite(altimeter)) {
        throw new Error(`Forecast data is available for ${icao}, but no current altimeter setting is available to support the nav log calculations.`);
    }

    const temperature = extractFirstFiniteNumber(
        forecastSegment,
        ['temp', 'tempC', 'temperature', 'temperatureC', 'airTemp'],
    );
    const latestObservedTemperature = extractFirstFiniteNumber(metarForAltimeter, ['temp', 'tempC', 'temperature', 'temperatureC', 'airTemp']);
    const windSpeed = extractFirstFiniteNumber(
        forecastSegment,
        ['wspd', 'windSpeed', 'wind_speed_kt', 'speed', 'spd'],
    );
    const windDirection = extractFirstFiniteNumber(
        forecastSegment,
        ['wdir', 'windDirection', 'wind_dir_degrees', 'direction', 'dir'],
        0,
    );

    const usableTemperature = Number.isFinite(temperature) ? temperature : latestObservedTemperature;

    if (![usableTemperature, windSpeed].every(Number.isFinite)) {
        throw new Error(`Incomplete forecast data returned for ${icao} at the selected date and time.`);
    }

    const variation = calculateMagneticVariation(location.lat, location.lon, location.elevation);
    const details = extractWeatherDetails(forecastSegment);
    const sourcePrefix = forecastSourceIcao && forecastSourceIcao !== icao
        ? `Forecast loaded for ${icao} from nearby TAF station ${forecastSourceIcao}.`
        : `Forecast loaded for ${icao}.`;
    const sourceDetail = Number.isFinite(temperature)
        ? 'Wind and temperature come from the FAA TAF; altimeter uses the latest available observation.'
        : 'Wind, visibility, and clouds come from the FAA TAF; temperature and altimeter use the latest available observation.';

    return {
        temperature: usableTemperature,
        altimeter: Number(altimeter.toFixed(2)),
        windSpeed,
        windDirection,
        elevation: location.elevation,
        lat: location.lat,
        lon: location.lon,
        variation,
        ...details,
        forecast: {
            isForecast: true,
            source: 'TAF',
            requestedTime: requestedTime.toISOString(),
            validFrom: extractDateValue(forecastSegment, ['fcstTimeFrom', 'startTime', 'validTimeFrom', 'timeFrom'])?.toISOString() || null,
            validTo: extractDateValue(forecastSegment, ['fcstTimeTo', 'endTime', 'validTimeTo', 'timeTo'])?.toISOString() || null,
            sourceIcao: forecastSourceIcao || icao,
            sourceDistanceNm: Number.isFinite(nearestForecast?.distanceNm) ? Number(nearestForecast.distanceNm.toFixed(1)) : 0,
            message: `${sourcePrefix} ${sourceDetail}`,
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
    const details = extractWeatherDetails(nearestMetar);

    return {
        temperature: nearestMetar.temp,
        altimeter: Number(altimeter.toFixed(2)),
        windSpeed: nearestMetar.wspd,
        windDirection: nearestMetar.wdir ?? 0,
        elevation: airportLocation.elevation,
        lat: airportLocation.lat,
        lon: airportLocation.lon,
        variation,
        ...details,
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

function isRequestedTimeCoveredByMetar(metar, requestedTime) {
    const observedAt = extractMetarObservationTime(metar);
    if (!observedAt) {
        return requestedTime.getTime() <= Date.now() + FUTURE_TIME_TOLERANCE_MS;
    }

    const earliestCoveredTime = observedAt.getTime() - METAR_COVERAGE_BEFORE_OBSERVATION_MS;
    const latestCoveredTime = observedAt.getTime() + METAR_COVERAGE_AFTER_OBSERVATION_MS;
    return requestedTime.getTime() >= earliestCoveredTime && requestedTime.getTime() <= latestCoveredTime;
}

function extractMetarObservationTime(metar) {
    return extractDateValue(metar, ['obsTime', 'reportTime', 'receiptTime', 'issueTime', 'validTime', 'time']);
}

function selectTafForecastSegment(taf, requestedTime) {
    const forecastSegments = []
        .concat(Array.isArray(taf?.fcsts) ? taf.fcsts : [])
        .concat(taf)
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

async function findNearestTafForecast(lat, lon, excludedIcao, requestedTime) {
    const candidates = await findNearestTafStations(lat, lon, excludedIcao);
    for (const candidate of candidates) {
        const taf = await fetchFirstRecord(`${TAF_BASE_URL}?ids=${candidate.station.icaoId}&format=json`, 'TAF API', { allowNoContent: true });
        const segment = taf ? selectTafForecastSegment(taf, requestedTime) : null;
        if (segment) {
            return {
                station: candidate.station,
                distanceNm: candidate.distanceNm,
                segment,
            };
        }
    }

    return null;
}

async function findNearestTafStations(lat, lon, excludedIcao) {
    const normalizedExcluded = String(excludedIcao || '').trim().toUpperCase();
    const stations = await loadTafStations();
    return stations
        .map((station) => ({
            station,
            distanceNm: calculateDistanceNm(lat, lon, Number(station.lat), Number(station.lon)),
        }))
        .filter((candidate) => candidate.station.icaoId !== normalizedExcluded)
        .filter((candidate) => Number.isFinite(candidate.distanceNm) && candidate.distanceNm <= MAX_NEAREST_TAF_DISTANCE_NM)
        .sort((left, right) => left.distanceNm - right.distanceNm)
        .slice(0, MAX_NEAREST_TAF_CANDIDATES);
}

function extractDateValue(record, keys) {
    for (const key of keys) {
        const value = record?.[key];
        if (value === null || value === undefined || value === '') {
            continue;
        }

        const parsed = parseDateValue(value);
        if (Number.isFinite(parsed.getTime())) {
            return parsed;
        }
    }

    return null;
}

function parseDateValue(value) {
    if (value instanceof Date) {
        return value;
    }

    if (Number.isFinite(Number(value))) {
        const numericValue = Number(value);
        const milliseconds = numericValue > 100000000000
            ? numericValue
            : numericValue * 1000;
        return new Date(milliseconds);
    }

    return new Date(value);
}

function extractFirstFiniteNumber(record, keys, fallback = null) {
    for (const key of keys) {
        const rawValue = record?.[key];
        if (Array.isArray(rawValue) || (rawValue && typeof rawValue === 'object')) {
            continue;
        }

        const value = Number(rawValue);
        if (Number.isFinite(value)) {
            return value;
        }
    }

    return fallback;
}

function extractWeatherDetails(record) {
    const visibilitySm = extractVisibilitySm(record);
    const cloudLayers = extractCloudLayers(record);
    const ceilingFt = extractCeilingFt(record, cloudLayers);
    const presentWeather = extractPresentWeather(record);
    const cloudSummary = summarizeCloudLayers(cloudLayers);
    const explicitFlightCategory = extractFlightCategory(record);
    const hazards = {
        precipitation: presentWeather.some((token) => isPrecipitationToken(token)),
        thunderstorm: presentWeather.some((token) => isThunderstormToken(token)),
    };

    return {
        visibilitySm,
        ceilingFt,
        cloudLayers,
        cloudSummary,
        presentWeather,
        hazards,
        flightCategory: explicitFlightCategory || computeFlightCategory(visibilitySm, ceilingFt),
    };
}

function extractVisibilitySm(record) {
    for (const key of ['visib', 'visibility', 'visibilitySm', 'visibilitySM', 'vis']) {
        const normalized = normalizeVisibilityValue(record?.[key]);
        if (Number.isFinite(normalized)) {
            return normalized;
        }
    }
    return null;
}

function normalizeVisibilityValue(value) {
    if (value === '' || value === null || value === undefined) {
        return null;
    }

    if (Number.isFinite(Number(value))) {
        return Number(value);
    }

    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim().toUpperCase();
    if (!normalized) {
        return null;
    }
    if (normalized === 'P6SM') {
        return 6;
    }

    const mixedFractionMatch = normalized.match(/^(\d+)\s+(\d+)\/(\d+)SM?$/);
    if (mixedFractionMatch) {
        return Number(mixedFractionMatch[1]) + (Number(mixedFractionMatch[2]) / Number(mixedFractionMatch[3]));
    }

    const fractionMatch = normalized.match(/^(\d+)\/(\d+)SM?$/);
    if (fractionMatch) {
        return Number(fractionMatch[1]) / Number(fractionMatch[2]);
    }

    const numericMatch = normalized.match(/^(\d+(?:\.\d+)?)SM?$/);
    if (numericMatch) {
        return Number(numericMatch[1]);
    }

    const plusMatch = normalized.match(/^(\d+(?:\.\d+)?)\+$/);
    if (plusMatch) {
        return Number(plusMatch[1]);
    }

    return null;
}

function extractFlightCategory(record) {
    for (const key of ['fltCat', 'flightCategory', 'flight_category']) {
        const value = String(record?.[key] || '').trim().toUpperCase();
        if (['VFR', 'MVFR', 'IFR', 'LIFR'].includes(value)) {
            return value;
        }
    }
    return null;
}

function extractCloudLayers(record) {
    const candidateKeys = ['clouds', 'cloudLayers', 'skyCover', 'sky_condition', 'skyCondition'];
    for (const key of candidateKeys) {
        const value = record?.[key];
        const normalized = normalizeCloudLayers(value);
        if (normalized.length > 0) {
            return normalized;
        }
    }
    return [];
}

function normalizeCloudLayers(value) {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    return list
        .map(normalizeCloudLayer)
        .filter(Boolean);
}

function normalizeCloudLayer(layer) {
    if (!layer) {
        return null;
    }

    if (typeof layer === 'string') {
        const match = layer.trim().toUpperCase().match(/^(FEW|SCT|BKN|OVC|VV|CLR|SKC|NSC)(\d{3})?$/);
        if (!match) {
            return null;
        }
        return {
            cover: match[1],
            baseFt: match[2] ? Number(match[2]) * 100 : null,
        };
    }

    const cover = String(
        layer.cover
        ?? layer.sky_cover
        ?? layer.skyCover
        ?? layer.amount
        ?? layer.type
        ?? ''
    ).trim().toUpperCase();
    if (!cover) {
        return null;
    }

    const baseRaw = layer.base
        ?? layer.baseFt
        ?? layer.cloud_base_ft_agl
        ?? layer.height
        ?? layer.altitude
        ?? layer.vert_vis_ft
        ?? layer.verticalVisibility;
    const baseFt = baseRaw === '' || baseRaw === null || baseRaw === undefined
        ? null
        : (Number.isFinite(Number(baseRaw)) ? Number(baseRaw) : null);

    return { cover, baseFt };
}

function extractCeilingFt(record, cloudLayers) {
    const explicit = extractFirstFiniteNumber(record, ['ceiling', 'ceilingFt', 'cig', 'vertVisFt', 'vert_vis_ft']);
    if (Number.isFinite(explicit)) {
        return explicit;
    }

    const ceilingLayer = cloudLayers.find((layer) => ['BKN', 'OVC', 'VV'].includes(layer.cover) && Number.isFinite(layer.baseFt));
    return ceilingLayer?.baseFt ?? null;
}

function extractPresentWeather(record) {
    const tokens = [];
    const arrayKeys = ['wx', 'weather', 'presentWeather', 'wxStringParts'];
    for (const key of arrayKeys) {
        const value = record?.[key];
        const normalized = normalizePresentWeatherTokens(value);
        if (normalized.length > 0) {
            tokens.push(...normalized);
        }
    }

    for (const key of ['wxString', 'wx_string', 'rawWx', 'rawwx']) {
        const value = record?.[key];
        if (typeof value === 'string' && value.trim()) {
            tokens.push(...value.trim().split(/\s+/));
        }
    }

    return Array.from(new Set(tokens
        .map((token) => String(token || '').trim().toUpperCase())
        .filter(Boolean)));
}

function normalizePresentWeatherTokens(value) {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    return list
        .map((item) => {
            if (typeof item === 'string') {
                return item;
            }
            return item?.value ?? item?.weather ?? item?.wx ?? item?.code ?? '';
        })
        .filter(Boolean);
}

function summarizeCloudLayers(cloudLayers) {
    if (!Array.isArray(cloudLayers) || cloudLayers.length === 0) {
        return 'Clear';
    }

    return cloudLayers
        .map((layer) => Number.isFinite(layer.baseFt) ? `${layer.cover} ${layer.baseFt.toLocaleString()} ft` : layer.cover)
        .join(', ');
}

function isPrecipitationToken(token) {
    return /(RA|SN|DZ|SG|PL|GR|GS|UP|SHRA|SHSN|SH|FZRA|FZDZ)/.test(token);
}

function isThunderstormToken(token) {
    return /TS/.test(token);
}

function computeFlightCategory(visibilitySm, ceilingFt) {
    const visibility = Number.isFinite(visibilitySm) ? visibilitySm : null;
    const ceiling = Number.isFinite(ceilingFt) ? ceilingFt : null;

    if (visibility === null && ceiling === null) {
        return 'UNKNOWN';
    }

    if ((visibility !== null && visibility < 1) || (ceiling !== null && ceiling < 500)) {
        return 'LIFR';
    }
    if ((visibility !== null && visibility < 3) || (ceiling !== null && ceiling < 1000)) {
        return 'IFR';
    }
    if ((visibility !== null && visibility <= 5) || (ceiling !== null && ceiling <= 3000)) {
        return 'MVFR';
    }
    return 'VFR';
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
    if (!metarStationCachePromise) {
        metarStationCachePromise = loadStationsBySiteType('METAR');
    }

    return metarStationCachePromise;
}

async function loadTafStations() {
    if (!tafStationCachePromise) {
        tafStationCachePromise = loadStationsBySiteType('TAF');
    }

    return tafStationCachePromise;
}

async function loadStationsBySiteType(siteType) {
    const stations = await loadStationCache();
    return stations.filter((station) => Array.isArray(station.siteType) && station.siteType.includes(siteType));
}

async function loadStationCache() {
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
                    .filter((station) => station.icaoId && Number.isFinite(Number(station.lat)) && Number.isFinite(Number(station.lon)));
            });
    }

    return stationCachePromise;
}

function normalizeBounds(bounds) {
    const minLat = Number(bounds?.minLat);
    const minLon = Number(bounds?.minLon);
    const maxLat = Number(bounds?.maxLat);
    const maxLon = Number(bounds?.maxLon);

    if (![minLat, minLon, maxLat, maxLon].every(Number.isFinite)) {
        throw new Error('Valid bounds are required.');
    }

    return { minLat, minLon, maxLat, maxLon };
}

async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function consume() {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
    }

    const consumers = Array.from({ length: Math.min(limit, items.length) }, () => consume());
    await Promise.all(consumers);
    return results;
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
