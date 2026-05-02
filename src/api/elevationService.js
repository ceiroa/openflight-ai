const USGS_EPQS_URL = 'https://epqs.nationalmap.gov/v1/json';
const ELEVATION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ELEVATION_FETCH_CONCURRENCY = 6;

const elevationCache = new Map();

export async function getElevationsForPoints(points) {
    const normalized = normalizePoints(points);
    const uniquePoints = dedupePoints(normalized);
    const elevationMap = new Map();
    const uncachedPoints = [];

    for (const point of uniquePoints) {
        const cacheKey = buildElevationCacheKey(point);
        const cached = readElevationCache(cacheKey);
        if (cached !== null) {
            elevationMap.set(cacheKey, cached);
            continue;
        }
        uncachedPoints.push(point);
    }

    await runWithConcurrency(uncachedPoints, ELEVATION_FETCH_CONCURRENCY, async (point) => {
        const cacheKey = buildElevationCacheKey(point);
        const elevationFt = await fetchElevationForPoint(point);
        writeElevationCache(cacheKey, elevationFt);
        elevationMap.set(cacheKey, elevationFt);
    });

    return normalized.map((point) => {
        const cacheKey = buildElevationCacheKey(point);
        return {
            lat: point.lat,
            lon: point.lon,
            elevationFt: elevationMap.get(cacheKey) ?? null,
        };
    });
}

function normalizePoints(points) {
    if (!Array.isArray(points) || points.length === 0) {
        throw new Error('At least one elevation point is required.');
    }

    return points.map((point) => {
        const lat = Number(point?.lat);
        const lon = Number(point?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            throw new Error('Each elevation point must include valid lat/lon values.');
        }
        return { lat, lon };
    });
}

function dedupePoints(points) {
    const seen = new Set();
    return points.filter((point) => {
        const key = buildElevationCacheKey(point);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function buildElevationCacheKey(point) {
    return `${Number(point.lat).toFixed(5)}|${Number(point.lon).toFixed(5)}`;
}

function readElevationCache(cacheKey) {
    const entry = elevationCache.get(cacheKey);
    if (!entry) {
        return null;
    }
    if (Date.now() - entry.savedAt > ELEVATION_CACHE_TTL_MS) {
        elevationCache.delete(cacheKey);
        return null;
    }
    return entry.elevationFt;
}

function writeElevationCache(cacheKey, elevationFt) {
    elevationCache.set(cacheKey, {
        savedAt: Date.now(),
        elevationFt,
    });
}

async function fetchElevationForPoint(point) {
    const params = new URLSearchParams({
        x: String(point.lon),
        y: String(point.lat),
        units: 'Feet',
        wkid: '4326',
        includeDate: 'false',
    });

    const response = await fetch(`${USGS_EPQS_URL}?${params.toString()}`, {
        headers: {
            'User-Agent': 'CieloRumbo/1.0 usgs-elevation-profile',
        },
    });

    if (!response.ok) {
        throw new Error(`USGS elevation request returned ${response.status}`);
    }

    const payload = await response.json();
    const elevationFt = Number(payload?.value);
    if (!Number.isFinite(elevationFt)) {
        throw new Error('USGS elevation service returned an invalid elevation.');
    }

    return elevationFt;
}

async function runWithConcurrency(items, concurrency, worker) {
    if (!Array.isArray(items) || items.length === 0) {
        return;
    }

    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            await worker(items[currentIndex]);
        }
    });

    await Promise.all(workers);
}
