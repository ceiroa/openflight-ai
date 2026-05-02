import { CURATED_VISUAL_CHECKPOINTS } from '../data/checkpoints/curatedVisualCheckpoints.js';

const AIRPORTS_CSV_URL = 'https://ourairports.com/data/airports.csv';
const AIRPORT_FREQUENCIES_CSV_URL = 'https://ourairports.com/data/airport-frequencies.csv';
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';
const AIRPORT_TYPES_FOR_CHECKPOINTS = new Set(['small_airport', 'medium_airport', 'large_airport']);
const LANDMARK_TYPE_SCORES = {
    lake: 0.6,
    reservoir: 0.7,
    river: 0.8,
    river_crossing: 0.9,
    town: 1.0,
    village: 1.1,
    prison: 1.15,
    bridge: 1.2,
    airport: 1.25,
    landmark: 1.5,
};
const VISUAL_FEATURE_TYPES = new Set(['bridge', 'airport', 'prison']);
const DISALLOWED_LANDMARK_NAME_PATTERNS = [
    /\btrail\b/i,
    /\broad\b/i,
    /\bstreet\b/i,
    /\bavenue\b/i,
    /\blane\b/i,
    /\bdrive\b/i,
    /\bboulevard\b/i,
    /\bhighway\b/i,
    /\broute\b/i,
];
const CLASSIC_TARGET_SPACING_NM = 7;
const ENHANCED_TARGET_SPACING_NM = 6.5;
const ENHANCED_MIN_SPACING_NM = 4.5;
const ENHANCED_MAX_SPACING_NM = 10;

let airportReferencePromise;
let airportFrequenciesPromise;

export function __resetAirportReferenceCaches() {
    airportReferencePromise = undefined;
    airportFrequenciesPromise = undefined;
}

export async function findAirportInReferenceData(candidateIds) {
    const airports = await loadAirportReferenceData();
    const normalizedIds = new Set(candidateIds.map((id) => id.trim().toUpperCase()));

    for (const airport of airports) {
        if (normalizedIds.has(airport.ident) || normalizedIds.has(airport.gpsCode) || normalizedIds.has(airport.localCode)) {
            return airport;
        }
    }

    return null;
}

export async function getAirportCommsByCode(code) {
    const airport = await findAirportInReferenceData([code]);
    if (!airport) {
        return {
            airportName: code,
            weather: null,
            traffic: null,
            summary: 'N/A',
        };
    }

    const frequencies = await loadAirportFrequencies();
    const matches = frequencies.filter((entry) => entry.airportIdent === airport.ident);
    const weather = matches.find((entry) => /ATIS|ASOS|AWOS/i.test(`${entry.type} ${entry.description}`)) ?? null;
    const tower = matches.find((entry) => /TWR|TOWER/i.test(`${entry.type} ${entry.description}`)) ?? null;
    const ctaf = matches.find((entry) => /CTAF|UNICOM|MULTICOM/i.test(`${entry.type} ${entry.description}`)) ?? null;

    const summaryParts = [];
    if (weather) {
        summaryParts.push(`${compactLabel(weather)} ${weather.frequencyMhz}`);
    }
    if (tower) {
        summaryParts.push(`TWR ${tower.frequencyMhz}`);
    } else if (ctaf) {
        summaryParts.push(`${compactLabel(ctaf)} ${ctaf.frequencyMhz}`);
    }

    return {
        airportName: airport.name || airport.ident,
        weather,
        traffic: tower ?? ctaf ?? null,
        summary: summaryParts.join(' | ') || 'N/A',
    };
}

export async function generateNamedCheckpointsForRoute(draft) {
    return generateClassicCheckpointsForRoute(draft);
}

export function getCuratedVisualCheckpointsInBounds(bounds) {
    const minLat = Number(bounds?.minLat);
    const minLon = Number(bounds?.minLon);
    const maxLat = Number(bounds?.maxLat);
    const maxLon = Number(bounds?.maxLon);

    if (![minLat, minLon, maxLat, maxLon].every(Number.isFinite)) {
        return [];
    }

    return CURATED_VISUAL_CHECKPOINTS.filter((checkpoint) => (
        checkpoint.lat >= minLat
        && checkpoint.lat <= maxLat
        && checkpoint.lon >= minLon
        && checkpoint.lon <= maxLon
    ));
}

export async function generateClassicCheckpointsForRoute(draft) {
    const airports = await loadAirportReferenceData();
    const usableAirports = airports.filter((airport) => AIRPORT_TYPES_FOR_CHECKPOINTS.has(airport.type));

    let previousPoint = {
        icao: draft.departure.icao,
        lat: Number(draft.departure.lat),
        lon: Number(draft.departure.lon),
    };

    const legs = [];

    for (let index = 0; index < draft.legs.length; index += 1) {
        const leg = draft.legs[index];
        const nextPoint = {
            icao: leg.icao,
            lat: Number(leg.lat),
            lon: Number(leg.lon),
        };

        const legDistanceNm = calculateDistanceNm(previousPoint.lat, previousPoint.lon, nextPoint.lat, nextPoint.lon);
        const segmentCount = Math.max(1, Math.round(legDistanceNm / CLASSIC_TARGET_SPACING_NM));
        const spacingNm = legDistanceNm / segmentCount;
        const checkpoints = [];
        const usedAirportIds = new Set([previousPoint.icao, nextPoint.icao]);
        const landmarks = await fetchLandmarkCandidatesForLeg(previousPoint, nextPoint);
        const usedLandmarkNames = new Set();

        for (let checkpointNumber = 1; checkpointNumber < segmentCount; checkpointNumber += 1) {
            const fraction = checkpointNumber / segmentCount;
            const samplePoint = interpolatePoint(previousPoint, nextPoint, fraction);
            const namedLandmark = findBestLandmark(samplePoint, previousPoint, nextPoint, landmarks, usedLandmarkNames);
            const bestAirport = findBestCheckpointAirport(previousPoint, nextPoint, samplePoint, usableAirports, usedAirportIds);
            const distanceFromLegStartNm = Math.round(legDistanceNm * fraction * 10) / 10;

            if (namedLandmark) {
                usedLandmarkNames.add(namedLandmark.name);
                checkpoints.push({
                    name: namedLandmark.name,
                    distanceFromLegStartNm,
                    fraction,
                    comms: "VIS",
                    featureType: namedLandmark.featureType,
                });
            } else if (bestAirport) {
                usedAirportIds.add(bestAirport.ident);
                const comms = await getAirportCommsByCode(bestAirport.ident);
                checkpoints.push({
                    name: bestAirport.name || bestAirport.ident,
                    distanceFromLegStartNm,
                    fraction,
                    comms: comms.summary,
                    airportCode: bestAirport.ident,
                });
            } else {
                checkpoints.push({
                    name: `${previousPoint.icao}-${nextPoint.icao} CP${checkpointNumber}`,
                    distanceFromLegStartNm,
                    fraction,
                    comms: 'VIS',
                });
            }
        }

        legs.push({
            legIndex: index,
            fromIcao: previousPoint.icao,
            toIcao: nextPoint.icao,
            legDistanceNm,
            spacingNm,
            checkpoints,
        });

        previousPoint = nextPoint;
    }

    return legs;
}

export async function generateEnhancedCheckpointsForRoute(draft) {
    const airports = await loadAirportReferenceData();
    const usableAirports = airports.filter((airport) => AIRPORT_TYPES_FOR_CHECKPOINTS.has(airport.type));

    let previousPoint = {
        icao: draft.departure.icao,
        lat: Number(draft.departure.lat),
        lon: Number(draft.departure.lon),
    };

    const legs = [];

    for (let index = 0; index < draft.legs.length; index += 1) {
        const leg = draft.legs[index];
        const nextPoint = {
            icao: leg.icao,
            lat: Number(leg.lat),
            lon: Number(leg.lon),
        };

        const legDistanceNm = calculateDistanceNm(previousPoint.lat, previousPoint.lon, nextPoint.lat, nextPoint.lon);
        const sampleFractions = buildEnhancedSampleFractions(legDistanceNm);
        const spacingNm = sampleFractions.length > 0 ? legDistanceNm / (sampleFractions.length + 1) : legDistanceNm;
        const checkpoints = [];
        const usedAirportIds = new Set([previousPoint.icao, nextPoint.icao]);
        const usedLandmarkNames = new Set();
        const usedVisualCheckpointNames = new Set();
        const landmarks = await fetchLandmarkCandidatesForLeg(previousPoint, nextPoint);
        const visualCheckpoints = findCuratedVisualCheckpointsForLeg(previousPoint, nextPoint);

        for (const fraction of sampleFractions) {
            const samplePoint = interpolatePoint(previousPoint, nextPoint, fraction);
            const distanceFromLegStartNm = Math.round(legDistanceNm * fraction * 10) / 10;
            const rankedCandidates = buildRankedEnhancedCandidates({
                start: previousPoint,
                end: nextPoint,
                samplePoint,
                usableAirports,
                landmarks,
                visualCheckpoints,
                usedAirportIds,
                usedLandmarkNames,
                usedVisualCheckpointNames,
                distanceFromLegStartNm,
            });

            const chosen = rankedCandidates[0];
            if (!chosen) {
                checkpoints.push({
                    name: `${previousPoint.icao}-${nextPoint.icao} CP${checkpoints.length + 1}`,
                    distanceFromLegStartNm,
                    fraction,
                    comms: 'VIS',
                    type: 'synthetic',
                    source: 'fallback',
                    score: 0,
                    lat: samplePoint.lat,
                    lon: samplePoint.lon,
                    notes: 'Fallback checkpoint generated from spacing only.',
                });
                continue;
            }

            const normalizedChosen = await normalizeEnhancedCheckpointChoice(chosen);
            if (normalizedChosen.airportCode) {
                usedAirportIds.add(normalizedChosen.airportCode);
            }
            if (normalizedChosen.name && normalizedChosen.source === 'curated_visual_checkpoint') {
                usedVisualCheckpointNames.add(normalizedChosen.name);
            }
            if (normalizedChosen.name && normalizedChosen.type !== 'airport') {
                usedLandmarkNames.add(normalizedChosen.name);
            }
            checkpoints.push(normalizedChosen);
        }

        legs.push({
            legIndex: index,
            fromIcao: previousPoint.icao,
            toIcao: nextPoint.icao,
            legDistanceNm,
            spacingNm,
            mode: 'enhanced',
            checkpoints,
        });

        previousPoint = nextPoint;
    }

    return legs;
}

async function fetchLandmarkCandidatesForLeg(start, end) {
    const bbox = buildExpandedBoundingBox(start, end, 0.08);
    const query = `
[out:json][timeout:20];
(
  node["name"]["natural"~"water|peak"](${bbox});
  way["name"]["natural"~"water|peak"](${bbox});
  relation["name"]["natural"~"water|peak"](${bbox});
  node["name"]["water"~"lake|reservoir"](${bbox});
  way["name"]["water"~"lake|reservoir"](${bbox});
  relation["name"]["water"~"lake|reservoir"](${bbox});
  node["name"]["waterway"="river"](${bbox});
  way["name"]["waterway"="river"](${bbox});
  relation["name"]["waterway"="river"](${bbox});
  node["name"]["place"~"city|town|village"](${bbox});
  way["name"]["place"~"city|town|village"](${bbox});
  relation["name"]["place"~"city|town|village"](${bbox});
  node["name"]["amenity"="prison"](${bbox});
  way["name"]["amenity"="prison"](${bbox});
  relation["name"]["amenity"="prison"](${bbox});
  node["name"]["bridge"="yes"](${bbox});
  way["name"]["bridge"="yes"](${bbox});
  relation["name"]["bridge"="yes"](${bbox});
  node["name"]["aeroway"="aerodrome"](${bbox});
  way["name"]["aeroway"="aerodrome"](${bbox});
  relation["name"]["aeroway"="aerodrome"](${bbox});
);
out center;
`;

    try {
        const response = await fetch(OVERPASS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=UTF-8',
                'User-Agent': 'CieloRumbo/1.0 checkpoint-planner',
            },
            body: query,
        });

        if (!response.ok) {
            return [];
        }

        const payload = await response.json();
        return normalizeLandmarks(payload?.elements ?? []);
    } catch {
        return [];
    }
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

async function loadAirportFrequencies() {
    if (!airportFrequenciesPromise) {
        airportFrequenciesPromise = fetch(AIRPORT_FREQUENCIES_CSV_URL)
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`airport frequency data returned ${response.status}`);
                }

                const csv = await response.text();
                return parseAirportFrequenciesCsv(csv);
            });
    }

    return airportFrequenciesPromise;
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
            name: values[indexByName.name] || '',
            municipality: values[indexByName.municipality] || '',
            type: values[indexByName.type] || '',
            lat: latitude,
            lon: longitude,
            elevation: Number.isFinite(elevationFeet) ? Math.round(elevationFeet) : 0,
        });
    }

    return airports;
}

function parseAirportFrequenciesCsv(csv) {
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
        return [];
    }

    const headers = parseCsvLine(lines[0]);
    const indexByName = Object.fromEntries(headers.map((header, index) => [header, index]));

    return lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        return {
            airportIdent: (values[indexByName.airport_ident] || '').toUpperCase(),
            type: values[indexByName.type] || '',
            description: values[indexByName.description] || '',
            frequencyMhz: values[indexByName.frequency_mhz] || '',
        };
    }).filter((entry) => entry.airportIdent && entry.frequencyMhz);
}

function findBestCheckpointAirport(start, end, samplePoint, airports, usedAirportIds) {
    let bestAirport = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const airport of airports) {
        if (usedAirportIds.has(airport.ident)) {
            continue;
        }

        const crossTrackNm = distancePointToSegmentNm(airport, start, end);
        const distanceToSampleNm = calculateDistanceNm(samplePoint.lat, samplePoint.lon, airport.lat, airport.lon);
        if (crossTrackNm > 4.5 || distanceToSampleNm > 8) {
            continue;
        }

        const score = (crossTrackNm * 2) + distanceToSampleNm;
        if (score < bestScore) {
            bestScore = score;
            bestAirport = airport;
        }
    }

    return bestAirport;
}

function findBestLandmark(samplePoint, start, end, landmarks, usedNames) {
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const landmark of landmarks) {
        if (!landmark.name || usedNames.has(landmark.name)) {
            continue;
        }

        const crossTrackNm = distancePointToSegmentNm(landmark, start, end);
        const distanceToSampleNm = calculateDistanceNm(samplePoint.lat, samplePoint.lon, landmark.lat, landmark.lon);
        if (crossTrackNm > 4.5 || distanceToSampleNm > 8) {
            continue;
        }

        const typeWeight = LANDMARK_TYPE_SCORES[landmark.featureType] ?? LANDMARK_TYPE_SCORES.landmark;
        const score = ((crossTrackNm * 2) + distanceToSampleNm) * typeWeight;
        if (score < bestScore) {
            bestScore = score;
            best = landmark;
        }
    }

    return best;
}

function buildEnhancedSampleFractions(legDistanceNm) {
    if (!Number.isFinite(legDistanceNm) || legDistanceNm <= ENHANCED_MIN_SPACING_NM) {
        return [];
    }

    const desiredCount = Math.max(1, Math.round(legDistanceNm / ENHANCED_TARGET_SPACING_NM));
    const fractions = [];
    for (let index = 1; index < desiredCount; index += 1) {
        fractions.push(index / desiredCount);
    }
    return fractions;
}

function buildRankedEnhancedCandidates({
    start,
    end,
    samplePoint,
    usableAirports,
    landmarks,
    visualCheckpoints,
    usedAirportIds,
    usedLandmarkNames,
    usedVisualCheckpointNames,
    distanceFromLegStartNm,
}) {
    const candidates = [];
    const legDistanceNm = calculateDistanceNm(start.lat, start.lon, end.lat, end.lon);

    for (const checkpoint of visualCheckpoints) {
        if (!checkpoint.name || usedVisualCheckpointNames.has(checkpoint.name)) {
            continue;
        }

        const crossTrackNm = distancePointToSegmentNm(checkpoint, start, end);
        const distanceToSampleNm = calculateDistanceNm(samplePoint.lat, samplePoint.lon, checkpoint.lat, checkpoint.lon);
        if (crossTrackNm > 5.5 || distanceToSampleNm > 10) {
            continue;
        }

        const baseScore = (crossTrackNm * 1.5) + distanceToSampleNm;
        candidates.push({
            name: checkpoint.name,
            distanceFromLegStartNm,
            fraction: legDistanceNm === 0 ? 0 : distanceFromLegStartNm / legDistanceNm,
            comms: 'VIS',
            type: 'visual_checkpoint',
            source: 'curated_visual_checkpoint',
            featureType: 'visual_checkpoint',
            score: scoreEnhancedCandidate(baseScore, 22),
            lat: checkpoint.lat,
            lon: checkpoint.lon,
            notes: checkpoint.notes || 'Curated visual checkpoint candidate prioritized for dead-reckoning review.',
        });
    }

    for (const landmark of landmarks) {
        if (!landmark.name || usedLandmarkNames.has(landmark.name)) {
            continue;
        }

        const crossTrackNm = distancePointToSegmentNm(landmark, start, end);
        const distanceToSampleNm = calculateDistanceNm(samplePoint.lat, samplePoint.lon, landmark.lat, landmark.lon);
        if (crossTrackNm > 4.5 || distanceToSampleNm > 8) {
            continue;
        }

        const typeWeight = LANDMARK_TYPE_SCORES[landmark.featureType] ?? LANDMARK_TYPE_SCORES.landmark;
        const baseScore = ((crossTrackNm * 2) + distanceToSampleNm) * typeWeight;
        const isVisualCheckpoint = VISUAL_FEATURE_TYPES.has(landmark.featureType);
        const score = scoreEnhancedCandidate(baseScore, isVisualCheckpoint ? 16 : 4);

        candidates.push({
            name: landmark.name,
            distanceFromLegStartNm,
            fraction: legDistanceNm === 0 ? 0 : distanceFromLegStartNm / legDistanceNm,
            comms: 'VIS',
            type: isVisualCheckpoint ? 'visual_checkpoint' : 'landmark',
            source: isVisualCheckpoint ? 'chart_candidate' : 'landmark',
            featureType: landmark.featureType,
            score,
            lat: landmark.lat,
            lon: landmark.lon,
            notes: isVisualCheckpoint
                ? 'Prominent feature prioritized as a likely visual checkpoint.'
                : 'Landmark candidate selected from the route corridor.',
        });
    }

    for (const airport of usableAirports) {
        if (usedAirportIds.has(airport.ident)) {
            continue;
        }

        const crossTrackNm = distancePointToSegmentNm(airport, start, end);
        const distanceToSampleNm = calculateDistanceNm(samplePoint.lat, samplePoint.lon, airport.lat, airport.lon);
        if (crossTrackNm > 4.5 || distanceToSampleNm > 8) {
            continue;
        }

        const baseScore = (crossTrackNm * 2) + distanceToSampleNm;
        candidates.push({
            name: airport.name || airport.ident,
            distanceFromLegStartNm,
            fraction: legDistanceNm === 0 ? 0 : distanceFromLegStartNm / legDistanceNm,
            comms: 'VIS',
            type: 'airport',
            source: 'airport_reference',
            airportCode: airport.ident,
            score: scoreEnhancedCandidate(baseScore, 12),
            lat: airport.lat,
            lon: airport.lon,
            notes: 'Airport candidate close to the route corridor with available communications data.',
        });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 3).map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
    }));
}

async function normalizeEnhancedCheckpointChoice(candidate) {
    if (candidate.type !== 'airport' || !candidate.airportCode) {
        return candidate;
    }

    const comms = await getAirportCommsByCode(candidate.airportCode);
    return {
        ...candidate,
        comms: comms.summary || candidate.comms,
        notes: comms.summary && comms.summary !== 'N/A'
            ? `Airport candidate with available communications: ${comms.summary}.`
            : candidate.notes,
    };
}

function scoreEnhancedCandidate(baseScore, priorityBonus) {
    return Math.max(1, Math.round((100 - (baseScore * 8) + priorityBonus) * 10) / 10);
}

function compactLabel(entry) {
    const combined = `${entry.type} ${entry.description}`.toUpperCase();
    if (combined.includes('AWOS')) {
        return 'AWOS';
    }
    if (combined.includes('ASOS')) {
        return 'ASOS';
    }
    if (combined.includes('ATIS')) {
        return 'ATIS';
    }
    if (combined.includes('CTAF')) {
        return 'CTAF';
    }
    if (combined.includes('UNICOM')) {
        return 'UNICOM';
    }
    if (combined.includes('MULTICOM')) {
        return 'MULTICOM';
    }
    return entry.type || 'FREQ';
}

function normalizeLandmarks(elements) {
    const seen = new Set();
    const landmarks = [];

    for (const element of elements) {
        const tags = element.tags || {};
        const lat = Number(element.lat ?? element.center?.lat);
        const lon = Number(element.lon ?? element.center?.lon);
        const name = String(tags.name || '').trim();
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) {
            continue;
        }

        if (isDisallowedLandmarkName(name)) {
            continue;
        }

        const featureType = classifyLandmark(tags);
        const dedupeKey = `${featureType}:${name.toLowerCase()}`;
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        landmarks.push({ name, lat, lon, featureType });
    }

    return landmarks;
}

function classifyLandmark(tags) {
    if (tags.aeroway === 'aerodrome') {
        return 'airport';
    }
    if (tags.amenity === 'prison') {
        return 'prison';
    }
    if (tags.bridge === 'yes') {
        return 'bridge';
    }
    if (tags.place === 'city' || tags.place === 'town') {
        return 'town';
    }
    if (tags.place === 'village') {
        return 'village';
    }
    if (tags.water === 'lake') {
        return 'lake';
    }
    if (tags.water === 'reservoir') {
        return 'reservoir';
    }
    if (tags.waterway === 'river') {
        return 'river';
    }
    if (tags.natural === 'water') {
        return 'lake';
    }
    if (tags.natural === 'peak') {
        return 'landmark';
    }
    return 'landmark';
}

function isDisallowedLandmarkName(name) {
    return DISALLOWED_LANDMARK_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function buildExpandedBoundingBox(start, end, expansionDegrees) {
    const minLat = Math.min(start.lat, end.lat) - expansionDegrees;
    const minLon = Math.min(start.lon, end.lon) - expansionDegrees;
    const maxLat = Math.max(start.lat, end.lat) + expansionDegrees;
    const maxLon = Math.max(start.lon, end.lon) + expansionDegrees;
    return `${minLat},${minLon},${maxLat},${maxLon}`;
}

function findCuratedVisualCheckpointsForLeg(start, end) {
    const minLat = Math.min(start.lat, end.lat) - 0.12;
    const minLon = Math.min(start.lon, end.lon) - 0.12;
    const maxLat = Math.max(start.lat, end.lat) + 0.12;
    const maxLon = Math.max(start.lon, end.lon) + 0.12;

    return CURATED_VISUAL_CHECKPOINTS.filter((checkpoint) => (
        checkpoint.lat >= minLat
        && checkpoint.lat <= maxLat
        && checkpoint.lon >= minLon
        && checkpoint.lon <= maxLon
    ));
}

function interpolatePoint(start, end, fraction) {
    return {
        lat: start.lat + ((end.lat - start.lat) * fraction),
        lon: start.lon + ((end.lon - start.lon) * fraction),
    };
}

function distancePointToSegmentNm(point, start, end) {
    const px = point.lon;
    const py = point.lat;
    const x1 = start.lon;
    const y1 = start.lat;
    const x2 = end.lon;
    const y2 = end.lat;

    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) {
        return calculateDistanceNm(point.lat, point.lon, start.lat, start.lon);
    }

    const t = Math.max(0, Math.min(1, (((px - x1) * dx) + ((py - y1) * dy)) / ((dx * dx) + (dy * dy))));
    const projection = {
        lon: x1 + (t * dx),
        lat: y1 + (t * dy),
    };

    return calculateDistanceNm(point.lat, point.lon, projection.lat, projection.lon);
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
