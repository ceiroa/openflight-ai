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
    motorway_junction: 1.35,
    landmark: 1.5,
};

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
        const segmentCount = Math.max(1, Math.round(legDistanceNm / 7));
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
  node["name"]["highway"="motorway_junction"](${bbox});
  way["name"]["highway"="motorway_junction"](${bbox});
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
                'User-Agent': 'OpenFlight-AI/1.0 checkpoint-planner',
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
    if (tags.highway === 'motorway_junction') {
        return 'motorway_junction';
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

function buildExpandedBoundingBox(start, end, expansionDegrees) {
    const minLat = Math.min(start.lat, end.lat) - expansionDegrees;
    const minLon = Math.min(start.lon, end.lon) - expansionDegrees;
    const maxLat = Math.max(start.lat, end.lat) + expansionDegrees;
    const maxLon = Math.max(start.lon, end.lon) + expansionDegrees;
    return `${minLat},${minLon},${maxLat},${maxLon}`;
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
