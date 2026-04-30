const FAA_CLASS_AIRSPACE_QUERY_URL = "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/ArcGIS/rest/services/Class_Airspace/FeatureServer/0/query";

const DEFAULT_CLASSES = ["B", "C", "D", "E"];

export async function getAirspaceForBounds(bounds, options = {}) {
    const normalizedBounds = normalizeBounds(bounds);
    const classes = normalizeClasses(options.classes);

    const params = new URLSearchParams({
        where: buildClassWhereClause(classes),
        geometry: `${normalizedBounds.minLon},${normalizedBounds.minLat},${normalizedBounds.maxLon},${normalizedBounds.maxLat}`,
        geometryType: "esriGeometryEnvelope",
        inSR: "4269",
        spatialRel: "esriSpatialRelIntersects",
        outFields: [
            "NAME",
            "CLASS",
            "TYPE_CODE",
            "LOCAL_TYPE",
            "LOWER_DESC",
            "UPPER_DESC",
            "ICAO_ID",
            "COMM_NAME",
            "SECTOR",
        ].join(","),
        returnGeometry: "true",
        outSR: "4326",
        f: "geojson",
    });

    const response = await fetch(`${FAA_CLASS_AIRSPACE_QUERY_URL}?${params.toString()}`, {
        headers: {
            "User-Agent": "OpenFlight-AI/1.0 faa-airspace-overlay",
        },
    });

    if (!response.ok) {
        throw new Error(`FAA airspace request returned ${response.status}`);
    }

    const payload = await response.json();
    const features = Array.isArray(payload.features)
        ? payload.features.map(normalizeFeature).filter(Boolean)
        : [];

    return {
        type: "FeatureCollection",
        features,
    };
}

function normalizeBounds(bounds) {
    const minLat = Number(bounds?.minLat);
    const minLon = Number(bounds?.minLon);
    const maxLat = Number(bounds?.maxLat);
    const maxLon = Number(bounds?.maxLon);

    if (![minLat, minLon, maxLat, maxLon].every(Number.isFinite)) {
        throw new Error("Valid airspace bounds are required.");
    }

    return {
        minLat,
        minLon,
        maxLat,
        maxLon,
    };
}

function normalizeClasses(classes) {
    if (!Array.isArray(classes) || classes.length === 0) {
        return DEFAULT_CLASSES;
    }

    const normalized = classes
        .map((value) => String(value || "").trim().toUpperCase())
        .filter(Boolean);

    return normalized.length > 0 ? normalized : DEFAULT_CLASSES;
}

function buildClassWhereClause(classes) {
    const quoted = classes.map((value) => `'${value.replaceAll("'", "''")}'`);
    return `CLASS IN (${quoted.join(",")})`;
}

function normalizeFeature(feature) {
    if (!feature?.geometry || feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon") {
        return null;
    }

    const properties = feature.properties || {};
    const airspaceClass = String(properties.CLASS || "").trim().toUpperCase();

    return {
        type: "Feature",
        geometry: feature.geometry,
        properties: {
            name: properties.NAME || "Unnamed Airspace",
            class: airspaceClass,
            typeCode: properties.TYPE_CODE || "",
            localType: properties.LOCAL_TYPE || "",
            lowerDesc: properties.LOWER_DESC || "",
            upperDesc: properties.UPPER_DESC || "",
            icaoId: properties.ICAO_ID || "",
            commName: properties.COMM_NAME || "",
            sector: properties.SECTOR || "",
        },
    };
}
