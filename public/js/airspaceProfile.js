import {
    createRouteSignature,
    loadAirspaceCache,
    loadFlightDraft,
    saveAirspaceCache,
} from "./flightStore.js";

const AIRSPACE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const AIRSPACE_CLASSES = "B,C,D,E";
const CORRIDOR_NM = 8;
const ALTITUDE_TOP_FT = 18000;
const GROUND_SAMPLE_SPACING_NM = 15;
const MAX_INLINE_LABELS = 6;
const PIXELS_PER_NM = 18;
const MIN_SVG_WIDTH = 960;
const SVG_HEIGHT = 560;
const MARGIN = { top: 28, right: 28, bottom: 46, left: 72 };

const AIRSPACE_COLORS = {
    B: { stroke: "#1d4ed8", fill: "rgba(37, 99, 235, 0.18)" },
    C: { stroke: "#c026d3", fill: "rgba(217, 70, 239, 0.18)" },
    D: { stroke: "#0f766e", fill: "rgba(20, 184, 166, 0.16)" },
    E: { stroke: "#b45309", fill: "rgba(245, 158, 11, 0.12)" },
    G: { stroke: "#eab308", fill: "rgba(234, 179, 8, 0.24)" },
    TERRAIN: { stroke: "#cbd5e1", fill: "rgba(203, 213, 225, 0.22)" },
};

const menuToggleButton = document.getElementById("menu-toggle");
const sideMenu = document.getElementById("side-menu");
const statusBanner = document.getElementById("status-banner");
const profileRoot = document.getElementById("profile-root");
const loadingProgress = document.getElementById("loading-progress");
const loadingProgressLabel = document.getElementById("loading-progress-label");
const loadingProgressBar = document.getElementById("loading-progress-bar");
const profileState = {
    routeLengthNm: 0,
    legSegments: [],
    projectedSegments: [],
    unresolvedSegments: [],
    elevationSamples: [],
    svgWidth: MIN_SVG_WIDTH,
    selectedClasses: new Set(["B", "C", "D", "E", "G"]),
};

document.addEventListener("DOMContentLoaded", () => {
    menuToggleButton.addEventListener("click", () => {
        setMenuOpenState(!sideMenu.classList.contains("open"));
    });
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("keydown", handleDocumentKeydown);

    const draft = loadFlightDraft();
    if (!isUsableDraft(draft)) {
        renderSetupRequiredState(
            "Enter a departure and at least one destination in Flight Setup before opening the airspace profile.",
        );
        return;
    }

    void renderAirspaceProfilePage(draft);
});

function handleDocumentClick(event) {
    if (!sideMenu.classList.contains("open")) {
        return;
    }

    if (sideMenu.contains(event.target) || menuToggleButton.contains(event.target)) {
        return;
    }

    setMenuOpenState(false);
}

function handleDocumentKeydown(event) {
    if (event.key === "Escape" && sideMenu.classList.contains("open")) {
        setMenuOpenState(false);
    }
}

function setMenuOpenState(isOpen) {
    sideMenu.classList.toggle("open", isOpen);
    menuToggleButton.classList.toggle("open", isOpen);
}

async function renderAirspaceProfilePage(draft) {
    try {
        const routeSignature = createRouteSignature(draft);
        const routePoints = buildRoutePoints(draft);
        const legSegments = buildLegSegments(routePoints, draft);
        const routeLengthNm = legSegments.reduce((total, leg) => total + leg.distanceNm, 0);
        const fetchBounds = expandBounds(buildRouteBounds(routePoints), CORRIDOR_NM);
        const elevationSamples = buildRouteElevationSamples(routePoints, routeLengthNm, GROUND_SAMPLE_SPACING_NM);

        showLoadingProgress("Loading FAA airspace for the route corridor...", 12);
        const [airspaceGeojson, elevatedRouteSamples] = await Promise.all([
            loadAirspaceForBounds(fetchBounds, routeSignature),
            loadElevationSamples(elevationSamples),
        ]);
        showLoadingProgress("Projecting FAA airspace onto the route profile...", 64);

        const { projectedSegments, unresolvedSegments } = projectAirspaceToRoute(airspaceGeojson.features || [], routePoints, routeLengthNm, elevatedRouteSamples);
        const svgWidth = Math.max(MIN_SVG_WIDTH, Math.round(routeLengthNm * PIXELS_PER_NM) + MARGIN.left + MARGIN.right);
        Object.assign(profileState, {
            routeLengthNm,
            legSegments,
            projectedSegments,
            unresolvedSegments,
            elevationSamples: elevatedRouteSamples,
            svgWidth,
        });
        renderProfileView();

        if (unresolvedSegments.length > 0) {
            showStatus("Some intersecting airspace still uses AGL or open-ended limits in the FAA feed, so it is listed separately instead of being drawn as an altitude band.", "info");
        }
        showLoadingProgress("Airspace profile loaded from FAA data.", 100);
        window.setTimeout(hideLoadingProgress, 500);
    } catch (error) {
        hideLoadingProgress();
        showStatus(error.message || "Failed to load the airspace profile.", "error");
        renderEmptyState("FAA airspace could not be loaded for this route right now.");
    }
}

function renderProfileView() {
    const selectedClassesLabel = Array.from(profileState.selectedClasses).sort().join(", ") || "None";
    const visibleProjectedSegments = profileState.projectedSegments.filter((segment) => profileState.selectedClasses.has(segment.classCode));
    const visibleUnresolvedSegments = profileState.unresolvedSegments.filter((segment) => profileState.selectedClasses.has(segment.classCode));
    const visibleClassGSegments = profileState.selectedClasses.has("G")
        ? deriveClassGSegments(profileState.projectedSegments, profileState.elevationSamples)
        : [];
    const svgMarkup = buildProfileSvg(
        visibleProjectedSegments,
        visibleClassGSegments,
        profileState.elevationSamples,
        profileState.routeLengthNm,
        profileState.svgWidth,
        profileState.legSegments,
    );

    profileRoot.innerHTML = `
        <div class="profile-layout">
            <section class="profile-panel">
                <h2>Altitude Profile</h2>
                <p class="profile-summary">Route distance: ${profileState.routeLengthNm.toFixed(1)} NM. Corridor width: +/-${CORRIDOR_NM} NM. Airspace classes shown: ${escapeHtml(selectedClassesLabel)}.</p>
                <div class="route-distance-scale">
                    <span>0 NM</span>
                    <span>${profileState.routeLengthNm.toFixed(1)} NM</span>
                </div>
                <div class="profile-scroll">
                    ${svgMarkup}
                </div>
                <div class="legend legend-controls" aria-label="Airspace class visibility and legend">
                    ${buildLegendToggleMarkup()}
                </div>
            </section>
            <aside class="summary-panel">
                <h2>Route Summary</h2>
                <ul class="summary-list">
                    ${profileState.legSegments.map((segment) => `
                        <li>
                            <strong>Leg ${segment.index + 1}: ${escapeHtml(segment.fromIcao)} to ${escapeHtml(segment.toIcao)}</strong>
                            <span class="summary-subtitle">${segment.distanceNm.toFixed(1)} NM</span>
                        </li>
                    `).join("")}
                </ul>
                <h3>Airspace Hits</h3>
                ${visibleProjectedSegments.length === 0
                    ? `<div class="empty-state">No selected airspace classes with usable vertical limits are currently shown.</div>`
                    : `
                        <ul class="summary-list">
                            ${visibleProjectedSegments.map((segment) => `
                                <li>
                                    <strong>${escapeHtml(segment.name)}</strong>
                                    <span class="summary-subtitle">Class ${escapeHtml(segment.classCode)} | ${segment.startNm.toFixed(1)} NM to ${segment.endNm.toFixed(1)} NM</span>
                                    <span class="summary-subtitle">${escapeHtml(segment.lowerLabel)} to ${escapeHtml(segment.upperLabel)}</span>
                                </li>
                            `).join("")}
                        </ul>
                    `}
                <h3>Unresolved Airspace</h3>
                ${visibleUnresolvedSegments.length === 0
                    ? `<div class="empty-state">All intersecting airspace in this corridor included usable vertical limits.</div>`
                    : `
                        <ul class="summary-list">
                            ${visibleUnresolvedSegments.map((segment) => `
                                <li>
                                    <strong>${escapeHtml(segment.name)}</strong>
                                    <span class="summary-subtitle">Class ${escapeHtml(segment.classCode)} | ${segment.startNm.toFixed(1)} NM to ${segment.endNm.toFixed(1)} NM</span>
                                    <span class="summary-subtitle">Vertical limits unavailable from current FAA Class_Airspace feed.</span>
                                </li>
                            `).join("")}
                        </ul>
                    `}
            </aside>
        </div>
    `;
    attachClassToggleHandlers();
}

function buildClassToggleMarkup() {
    return ["B", "C", "D", "E", "G"].map((classCode) => `
        <label class="class-toggle-pill ${profileState.selectedClasses.has(classCode) ? "active" : ""}">
            <input type="checkbox" data-airspace-class-toggle="${classCode}" ${profileState.selectedClasses.has(classCode) ? "checked" : ""}>
            <span>Class ${classCode}</span>
        </label>
    `).join("");
}

function buildLegendToggleMarkup() {
    return Object.keys(AIRSPACE_COLORS).map((airspaceClass) => {
        if (airspaceClass === "TERRAIN") {
            return `
                <span class="legend-item legend-static-item">
                    <span class="legend-swatch legend-swatch-terrain"></span>
                    <span>Terrain</span>
                </span>
            `;
        }
        return `
            <label class="legend-item legend-toggle-item ${profileState.selectedClasses.has(airspaceClass) ? "active" : ""}">
                <input type="checkbox" data-airspace-class-toggle="${airspaceClass}" ${profileState.selectedClasses.has(airspaceClass) ? "checked" : ""}>
                <span class="legend-swatch legend-swatch-${airspaceClass.toLowerCase()}"></span>
                <span>Class ${airspaceClass}</span>
            </label>
        `;
    }).join("") + `
        <span class="legend-item legend-static-item">
            <span class="legend-swatch legend-swatch-cruise"></span>
            <span>Planned Cruise</span>
        </span>
    `;
}

function attachClassToggleHandlers() {
    document.querySelectorAll("[data-airspace-class-toggle]").forEach((input) => {
        input.addEventListener("change", (event) => {
            const classCode = event.target.getAttribute("data-airspace-class-toggle");
            if (!classCode) {
                return;
            }
            if (event.target.checked) {
                profileState.selectedClasses.add(classCode);
            } else {
                profileState.selectedClasses.delete(classCode);
            }
            renderProfileView();
        });
    });
}

async function loadAirspaceForBounds(bounds, routeSignature) {
    const cacheKey = buildAirspaceCacheKey(bounds);
    const routeCacheKey = buildAirspaceRouteCacheKey(routeSignature);
    const cached = loadCachedAirspace(cacheKey, bounds, routeCacheKey);
    if (cached) {
        return cached;
    }

    const response = await fetch(buildAirspaceUrl(bounds));
    if (!response.ok) {
        const failure = await response.json().catch(() => ({ error: "FAA airspace request failed." }));
        throw new Error(failure.error || "FAA airspace request failed.");
    }

    const payload = await response.json();
    cacheAirspace(cacheKey, payload, bounds, routeCacheKey);
    return payload;
}

async function loadElevationSamples(samples) {
    const response = await fetch('/api/elevation-profile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            points: samples.map((sample) => ({
                lat: sample.lat,
                lon: sample.lon,
            })),
        }),
    });

    if (!response.ok) {
        const failure = await response.json().catch(() => ({ error: 'USGS elevation request failed.' }));
        throw new Error(failure.error || 'USGS elevation request failed.');
    }

    const payload = await response.json();
    const elevations = Array.isArray(payload?.points) ? payload.points : [];
    return samples.map((sample, index) => ({
        ...sample,
        elevationFt: Number(elevations[index]?.elevationFt),
    }));
}

function buildRoutePoints(draft) {
    return [
        {
            icao: draft.departure.icao,
            lat: Number(draft.departure.lat),
            lon: Number(draft.departure.lon),
        },
        ...draft.legs.map((leg) => ({
            icao: leg.icao,
            lat: Number(leg.lat),
            lon: Number(leg.lon),
        })),
    ];
}

function buildLegSegments(routePoints, draft) {
    return routePoints.slice(1).map((point, index) => {
        const from = routePoints[index];
        const distanceNm = calculateDistanceNm(from.lat, from.lon, point.lat, point.lon);
        return {
            index,
            fromIcao: from.icao,
            toIcao: point.icao,
            distanceNm,
            plannedAlt: Number(draft?.legs?.[index]?.plannedAlt || draft?.legs?.[0]?.plannedAlt || draft?.cruiseAlt || draft?.cruise_alt || 3000),
        };
    });
}

function buildRouteBounds(routePoints) {
    return routePoints.reduce((bounds, point) => ({
        minLat: Math.min(bounds.minLat, point.lat),
        minLon: Math.min(bounds.minLon, point.lon),
        maxLat: Math.max(bounds.maxLat, point.lat),
        maxLon: Math.max(bounds.maxLon, point.lon),
    }), {
        minLat: Number.POSITIVE_INFINITY,
        minLon: Number.POSITIVE_INFINITY,
        maxLat: Number.NEGATIVE_INFINITY,
        maxLon: Number.NEGATIVE_INFINITY,
    });
}

function expandBounds(bounds, corridorNm) {
    const latPadding = corridorNm / 60;
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const lonPadding = corridorNm / (60 * Math.max(Math.cos(centerLat * Math.PI / 180), 0.25));

    return {
        minLat: bounds.minLat - latPadding,
        minLon: bounds.minLon - lonPadding,
        maxLat: bounds.maxLat + latPadding,
        maxLon: bounds.maxLon + lonPadding,
    };
}

function projectAirspaceToRoute(features, routePoints, routeLengthNm, elevationSamples) {
    const projected = [];
    const unresolved = [];

    features.forEach((feature) => {
        const intervals = projectFeatureOntoRoute(feature.geometry, routePoints);
        if (intervals.length === 0) {
            return;
        }

        intervals.forEach((interval) => {
            const startNm = Math.max(0, interval.startNm);
            const endNm = Math.min(routeLengthNm, interval.endNm);
            if (!Number.isFinite(startNm) || !Number.isFinite(endNm) || endNm <= startNm) {
                return;
            }

            const properties = feature.properties || {};
            const midpointNm = (startNm + endNm) / 2;
            const groundElevationFt = getGroundElevationAtAlongNm(elevationSamples, midpointNm);
            const lower = resolveAirspaceAltitude(properties, "lower", groundElevationFt);
            const upper = resolveAirspaceAltitude(properties, "upper", groundElevationFt);

            const record = {
                name: buildAirspaceDisplayName(properties),
                classCode: properties.class || "?",
                startNm,
                endNm,
                lowerFt: lower.feet,
                upperFt: upper.feet === null ? null : Math.min(upper.feet, ALTITUDE_TOP_FT),
                lowerLabel: lower.label,
                upperLabel: upper.label,
            };

            if (lower.feet === null || upper.feet === null || upper.feet <= lower.feet) {
                unresolved.push(record);
                return;
            }

            projected.push(record);
        });
    });

    return {
        projectedSegments: projected
            .sort((left, right) => left.startNm - right.startNm || right.upperFt - left.upperFt),
        unresolvedSegments: unresolved
            .sort((left, right) => left.startNm - right.startNm),
    };
}

function projectFeatureOntoRoute(geometry, routePoints) {
    const intervals = [];
    let cumulativeNm = 0;

    for (let index = 0; index < routePoints.length - 1; index += 1) {
        const from = routePoints[index];
        const to = routePoints[index + 1];
        const legDistanceNm = calculateDistanceNm(from.lat, from.lon, to.lat, to.lon);
        if (!Number.isFinite(legDistanceNm) || legDistanceNm <= 0) {
            cumulativeNm += legDistanceNm;
            continue;
        }

        const legIntervals = findGeometryIntervalsOnSegment(geometry, from, to);
        legIntervals.forEach((interval) => {
            intervals.push({
                startNm: cumulativeNm + interval.startT * legDistanceNm,
                endNm: cumulativeNm + interval.endT * legDistanceNm,
            });
        });

        cumulativeNm += legDistanceNm;
    }

    return mergeRouteIntervals(intervals);
}

function findGeometryIntervalsOnSegment(geometry, from, to) {
    if (!geometry) {
        return [];
    }

    if (geometry.type === "Polygon") {
        return findPolygonIntervalsOnSegment(geometry.coordinates, from, to);
    }

    if (geometry.type === "MultiPolygon") {
        return mergeRouteIntervals(
            geometry.coordinates.flatMap((polygonCoordinates) => findPolygonIntervalsOnSegment(polygonCoordinates, from, to)),
            "startT",
            "endT",
        );
    }

    return [];
}

function findPolygonIntervalsOnSegment(rings, from, to) {
    if (!Array.isArray(rings) || rings.length === 0) {
        return [];
    }

    const points = [0, 1];
    rings.forEach((ring) => {
        collectRingIntersections(points, ring, from, to);
    });

    const sorted = dedupeSortedNumbers(points.sort((left, right) => left - right));
    const intervals = [];

    for (let index = 0; index < sorted.length - 1; index += 1) {
        const startT = sorted[index];
        const endT = sorted[index + 1];
        if (endT - startT <= 0.0001) {
            continue;
        }

        const midT = (startT + endT) / 2;
        const midpoint = interpolatePoint(from, to, midT);
        if (pointInPolygonGeometry(midpoint, rings)) {
            intervals.push({ startT, endT });
        }
    }

    return intervals;
}

function collectRingIntersections(target, ring, from, to) {
    if (!Array.isArray(ring) || ring.length < 2) {
        return;
    }

    for (let index = 0; index < ring.length - 1; index += 1) {
        const edgeStart = coordinateToPoint(ring[index]);
        const edgeEnd = coordinateToPoint(ring[index + 1]);
        const intersection = findSegmentIntersectionT(from, to, edgeStart, edgeEnd);
        if (intersection !== null) {
            target.push(intersection);
        }
    }
}

function findSegmentIntersectionT(segmentStart, segmentEnd, edgeStart, edgeEnd) {
    const p = { x: Number(segmentStart.lon), y: Number(segmentStart.lat) };
    const r = { x: Number(segmentEnd.lon) - p.x, y: Number(segmentEnd.lat) - p.y };
    const q = { x: Number(edgeStart.lon), y: Number(edgeStart.lat) };
    const s = { x: Number(edgeEnd.lon) - q.x, y: Number(edgeEnd.lat) - q.y };
    const denominator = cross2d(r, s);
    const qMinusP = { x: q.x - p.x, y: q.y - p.y };

    if (Math.abs(denominator) < 1e-12) {
        return null;
    }

    const t = cross2d(qMinusP, s) / denominator;
    const u = cross2d(qMinusP, r) / denominator;

    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
        return clamp(t, 0, 1);
    }

    return null;
}

function pointInPolygonGeometry(point, rings) {
    if (!pointInRing(point, rings[0])) {
        return false;
    }

    for (let index = 1; index < rings.length; index += 1) {
        if (pointInRing(point, rings[index])) {
            return false;
        }
    }

    return true;
}

function pointInRing(point, ring) {
    if (!Array.isArray(ring) || ring.length < 3) {
        return false;
    }

    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const pointI = coordinateToPoint(ring[i]);
        const pointJ = coordinateToPoint(ring[j]);
        const intersects = ((pointI.lat > point.lat) !== (pointJ.lat > point.lat))
            && (point.lon < (pointJ.lon - pointI.lon) * (point.lat - pointI.lat) / ((pointJ.lat - pointI.lat) || 1e-12) + pointI.lon);
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}

function interpolatePoint(from, to, t) {
    return {
        lat: Number(from.lat) + (Number(to.lat) - Number(from.lat)) * t,
        lon: Number(from.lon) + (Number(to.lon) - Number(from.lon)) * t,
    };
}

function coordinateToPoint([lon, lat]) {
    return {
        lat: Number(lat),
        lon: Number(lon),
    };
}

function cross2d(left, right) {
    return left.x * right.y - left.y * right.x;
}

function dedupeSortedNumbers(values) {
    return values.filter((value, index) => index === 0 || Math.abs(value - values[index - 1]) > 1e-6);
}

function mergeRouteIntervals(intervals, startKey = "startNm", endKey = "endNm") {
    if (!Array.isArray(intervals) || intervals.length === 0) {
        return [];
    }

    const sorted = [...intervals].sort((left, right) => left[startKey] - right[startKey] || left[endKey] - right[endKey]);
    const merged = [sorted[0]];

    for (let index = 1; index < sorted.length; index += 1) {
        const current = sorted[index];
        const last = merged[merged.length - 1];
        if (current[startKey] <= last[endKey] + 1e-6) {
            last[endKey] = Math.max(last[endKey], current[endKey]);
            continue;
        }
        merged.push({ ...current });
    }

    return merged;
}

function toLocalNm(point, originLat) {
    return {
        x: Number(point.lon) * 60 * Math.cos(originLat * Math.PI / 180),
        y: Number(point.lat) * 60,
    };
}

function resolveAirspaceAltitude(properties, edge, groundElevationFt = null) {
    const valueKey = edge === "lower" ? "lowerVal" : "upperVal";
    const unitKey = edge === "lower" ? "lowerUom" : "upperUom";
    const codeKey = edge === "lower" ? "lowerCode" : "upperCode";
    const descKey = edge === "lower" ? "lowerDesc" : "upperDesc";

    const value = Number(properties?.[valueKey]);
    const unit = String(properties?.[unitKey] || "").trim().toUpperCase();
    const code = String(properties?.[codeKey] || "").trim().toUpperCase();
    const desc = String(properties?.[descKey] || "").trim().toUpperCase();

    if (edge === "lower" && code === "SFC" && Number.isFinite(groundElevationFt)) {
        const aglFeet = Number.isFinite(value) && value > 0 ? value : 0;
        const feet = groundElevationFt + aglFeet;
        if (aglFeet > 0) {
            return { feet, label: `${aglFeet.toLocaleString()} ft AGL (~${Math.round(feet).toLocaleString()} ft MSL)` };
        }
        return { feet, label: `SFC (~${Math.round(feet).toLocaleString()} ft MSL)` };
    }

    if (code === "MSL" && unit === "FT" && Number.isFinite(value) && value >= 0) {
        return { feet: value, label: `${value.toLocaleString()} ft MSL` };
    }

    if (desc === "SFC" || desc === "SURFACE") {
        return { feet: 0, label: "SFC" };
    }

    const flightLevel = desc.match(/FL\s*(\d+)/);
    if (flightLevel) {
        const feet = Number(flightLevel[1]) * 100;
        return { feet, label: `FL${flightLevel[1]}` };
    }

    if (desc.includes("UNL") || desc === "AA" || value === -9998) {
        return { feet: ALTITUDE_TOP_FT, label: "UNL" };
    }

    if (unit === "FT" && Number.isFinite(value) && value >= 0) {
        const suffix = [unit, code].filter(Boolean).join(" ").trim();
        return { feet: value, label: suffix ? `${value.toLocaleString()} ${suffix}` : `${value.toLocaleString()}` };
    }

    return {
        feet: null,
        label: formatAirspaceAltitudeLabel(value, unit, code, desc),
    };
}

function formatAirspaceAltitudeLabel(value, unit, code, desc) {
    if (desc) {
        return desc;
    }
    if (Number.isFinite(value)) {
        const suffix = [unit, code].filter(Boolean).join(" ").trim();
        return suffix ? `${value.toLocaleString()} ${suffix}` : `${value.toLocaleString()}`;
    }
    return "Unknown";
}

function buildAirspaceDisplayName(properties) {
    const name = properties?.name || "Unnamed Airspace";
    const sector = String(properties?.sector || "").trim();
    return sector ? `${name} ${sector}` : name;
}

function buildProfileSvg(segments, classGSegments, elevationSamples, routeLengthNm, svgWidth, legSegments) {
    const plotWidth = svgWidth - MARGIN.left - MARGIN.right;
    const plotHeight = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;
    const xScale = (value) => MARGIN.left + (value / Math.max(routeLengthNm, 1)) * plotWidth;
    const yScale = (altitude) => MARGIN.top + (1 - altitude / ALTITUDE_TOP_FT) * plotHeight;
    const gridLines = [0, 3000, 6000, 9000, 12000, 15000, 18000];
    const terrainPath = buildTerrainPath(elevationSamples, xScale, yScale);
    const classGPaths = buildClassGPaths(classGSegments, xScale, yScale);
    let labelsPlaced = 0;
    let lastLabelRight = -Infinity;
    let altitudeLabelsPlaced = 0;
    let lastAltitudeLabelRight = -Infinity;

    const airspaceRects = segments.map((segment) => {
        const x = xScale(segment.startNm);
        const width = Math.max(2, xScale(segment.endNm) - x);
        const top = yScale(segment.upperFt);
        const bottom = yScale(segment.lowerFt);
        const colors = AIRSPACE_COLORS[segment.classCode] || AIRSPACE_COLORS.E;
        const height = Math.max(2, bottom - top);
        const showInlineLabel = labelsPlaced < MAX_INLINE_LABELS
            && width >= 180
            && height >= 36
            && x >= lastLabelRight + 28;
        if (showInlineLabel) {
            labelsPlaced += 1;
            lastLabelRight = x + width;
        }
        const showAltitudeLabel = shouldShowAirspaceAltitudeLabel(segment, x, width, top, altitudeLabelsPlaced, lastAltitudeLabelRight);
        if (showAltitudeLabel) {
            altitudeLabelsPlaced += 1;
            lastAltitudeLabelRight = x + width;
        }
        return `
            <g>
                <rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}"
                    fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2" ${segment.classCode === "E" ? 'stroke-dasharray="6 4"' : ""}/>
                ${showAltitudeLabel ? buildAirspaceAltitudeLabel(segment, x, width, top, colors) : ""}
                ${showInlineLabel ? `
                    <text x="${(x + 6).toFixed(1)}" y="${(top + 14).toFixed(1)}" fill="${colors.stroke}" font-size="11" font-weight="700">
                        ${escapeHtml(`${segment.name} (${segment.classCode})`)}
                    </text>
                ` : ""}
            </g>
        `;
    }).join("");

    const cruiseProfile = buildCruiseProfileMarkup(legSegments, xScale, yScale);

    return `
        <svg class="profile-svg" width="${svgWidth}" height="${SVG_HEIGHT}" viewBox="0 0 ${svgWidth} ${SVG_HEIGHT}" role="img" aria-label="Airspace altitude profile for the current route">
            <rect x="0" y="0" width="${svgWidth}" height="${SVG_HEIGHT}" fill="#020617"></rect>
            ${gridLines.map((line) => `
                <g>
                    <line x1="${MARGIN.left}" y1="${yScale(line).toFixed(1)}" x2="${svgWidth - MARGIN.right}" y2="${yScale(line).toFixed(1)}" stroke="rgba(148, 163, 184, 0.3)" stroke-width="1"/>
                    <text x="${MARGIN.left - 10}" y="${(yScale(line) + 4).toFixed(1)}" fill="#94a3b8" font-size="11" text-anchor="end">${line.toLocaleString()}</text>
                </g>
            `).join("")}
            ${classGPaths}
            ${terrainPath}
            ${cruiseProfile}
            ${airspaceRects}
            <line x1="${MARGIN.left}" y1="${SVG_HEIGHT - MARGIN.bottom}" x2="${svgWidth - MARGIN.right}" y2="${SVG_HEIGHT - MARGIN.bottom}" stroke="#e2e8f0" stroke-width="1.5"/>
            <line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${SVG_HEIGHT - MARGIN.bottom}" stroke="#e2e8f0" stroke-width="1.5"/>
            ${buildDistanceTicks(routeLengthNm, xScale)}
        </svg>
    `;
}

function shouldShowAirspaceAltitudeLabel(segment, x, width, top, labelsPlaced, lastLabelRight) {
    return ["B", "C", "D"].includes(segment.classCode)
        && labelsPlaced < 16
        && width >= 42
        && top >= MARGIN.top + 14
        && x >= lastLabelRight + 18;
}

function buildAirspaceAltitudeLabel(segment, x, width, top, colors) {
    const label = formatCompactAltitude(segment.upperFt);
    const labelX = Math.max(MARGIN.left + 18, Math.min(x + width / 2, x + width - 18));
    const labelY = Math.max(MARGIN.top + 12, top - 5);
    return `
        <text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" fill="${colors.stroke}" font-size="10" font-weight="700" text-anchor="middle">
            ${escapeHtml(label)}
        </text>
    `;
}

function formatCompactAltitude(value) {
    const feet = Number(value);
    if (!Number.isFinite(feet)) {
        return "";
    }
    if (feet >= 10000) {
        return `${Math.round(feet / 1000)}k`;
    }
    return String(Math.round(feet));
}

function buildCruiseProfileMarkup(legSegments, xScale, yScale) {
    if (!Array.isArray(legSegments) || legSegments.length === 0) {
        return "";
    }

    const lineSegments = [];
    const labels = [];
    let startNm = 0;
    let previousY = null;

    legSegments.forEach((segment) => {
        const endNm = startNm + segment.distanceNm;
        const cruiseAltitude = Math.min(Math.max(Number(segment.plannedAlt) || 3000, 0), ALTITUDE_TOP_FT);
        const y = yScale(cruiseAltitude);
        const startX = xScale(startNm);
        const endX = xScale(endNm);

        if (previousY !== null && Math.abs(previousY - y) > 0.5) {
            lineSegments.push(`<line x1="${startX.toFixed(1)}" y1="${previousY.toFixed(1)}" x2="${startX.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#f43f5e" stroke-width="2.2" stroke-dasharray="8 5"/>`);
        }

        lineSegments.push(`<line x1="${startX.toFixed(1)}" y1="${y.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#f43f5e" stroke-width="3" stroke-dasharray="10 6"/>`);

        const labelX = Math.min(endX - 6, Math.max(startX + 6, (startX + endX) / 2));
        labels.push(`<text x="${labelX.toFixed(1)}" y="${(y - 8).toFixed(1)}" fill="#fda4af" font-size="12" text-anchor="middle">Leg ${segment.index + 1} cruise ${cruiseAltitude.toLocaleString()} ft</text>`);

        startNm = endNm;
        previousY = y;
    });

    return `${lineSegments.join("")}${labels.join("")}`;
}

function buildDistanceTicks(routeLengthNm, xScale) {
    const tickStep = routeLengthNm <= 30 ? 5 : routeLengthNm <= 80 ? 10 : 20;
    const ticks = [];
    for (let tick = 0; tick <= routeLengthNm + 0.001; tick += tickStep) {
        const x = xScale(Math.min(tick, routeLengthNm));
        ticks.push(`
            <g>
                <line x1="${x.toFixed(1)}" y1="${SVG_HEIGHT - MARGIN.bottom}" x2="${x.toFixed(1)}" y2="${SVG_HEIGHT - MARGIN.bottom + 6}" stroke="#e2e8f0" stroke-width="1"/>
                <text x="${x.toFixed(1)}" y="${SVG_HEIGHT - MARGIN.bottom + 22}" fill="#94a3b8" font-size="11" text-anchor="middle">${Math.round(tick)}</text>
            </g>
        `);
    }
    return ticks.join("");
}

function buildAirspaceUrl(bounds) {
    const params = new URLSearchParams({
        minLat: String(bounds.minLat),
        minLon: String(bounds.minLon),
        maxLat: String(bounds.maxLat),
        maxLon: String(bounds.maxLon),
        classes: AIRSPACE_CLASSES,
    });
    return `/api/airspace?${params.toString()}`;
}

function buildRouteElevationSamples(routePoints, routeLengthNm, spacingNm) {
    const samples = [];
    for (let alongNm = 0; alongNm < routeLengthNm; alongNm += spacingNm) {
        const point = interpolatePointAlongRoute(routePoints, alongNm);
        if (point) {
            samples.push({ alongNm, lat: point.lat, lon: point.lon });
        }
    }

    const finalPoint = interpolatePointAlongRoute(routePoints, routeLengthNm);
    if (finalPoint) {
        samples.push({ alongNm: routeLengthNm, lat: finalPoint.lat, lon: finalPoint.lon });
    }

    return dedupeRouteSamples(samples);
}

function interpolatePointAlongRoute(routePoints, targetAlongNm) {
    let cumulativeNm = 0;

    for (let index = 0; index < routePoints.length - 1; index += 1) {
        const from = routePoints[index];
        const to = routePoints[index + 1];
        const legDistanceNm = calculateDistanceNm(from.lat, from.lon, to.lat, to.lon);
        if (!Number.isFinite(legDistanceNm) || legDistanceNm <= 0) {
            continue;
        }

        if (targetAlongNm <= cumulativeNm + legDistanceNm || index === routePoints.length - 2) {
            const legOffsetNm = clamp(targetAlongNm - cumulativeNm, 0, legDistanceNm);
            const t = legDistanceNm === 0 ? 0 : legOffsetNm / legDistanceNm;
            return interpolatePoint(from, to, t);
        }

        cumulativeNm += legDistanceNm;
    }

    return routePoints[routePoints.length - 1] || null;
}

function dedupeRouteSamples(samples) {
    const seen = new Set();
    return samples.filter((sample) => {
        const key = `${sample.alongNm.toFixed(3)}|${sample.lat.toFixed(5)}|${sample.lon.toFixed(5)}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function getGroundElevationAtAlongNm(elevationSamples, alongNm) {
    if (!Array.isArray(elevationSamples) || elevationSamples.length === 0) {
        return null;
    }

    if (alongNm <= elevationSamples[0].alongNm) {
        return Number(elevationSamples[0].elevationFt);
    }

    for (let index = 0; index < elevationSamples.length - 1; index += 1) {
        const start = elevationSamples[index];
        const end = elevationSamples[index + 1];
        if (alongNm >= start.alongNm && alongNm <= end.alongNm) {
            const span = end.alongNm - start.alongNm;
            const t = span <= 0 ? 0 : (alongNm - start.alongNm) / span;
            return Number(start.elevationFt) + (Number(end.elevationFt) - Number(start.elevationFt)) * t;
        }
    }

    return Number(elevationSamples[elevationSamples.length - 1].elevationFt);
}

function deriveClassGSegments(projectedSegments, elevationSamples) {
    const segments = [];
    if (!Array.isArray(elevationSamples) || elevationSamples.length < 2) {
        return segments;
    }

    const boundaries = buildClassGBoundaries(projectedSegments, elevationSamples);
    for (let index = 0; index < boundaries.length - 1; index += 1) {
        const startNm = boundaries[index];
        const endNm = boundaries[index + 1];
        if (endNm - startNm <= 0.001) {
            continue;
        }

        const midpointNm = (startNm + endNm) / 2;
        const activeFloors = projectedSegments
            .filter((segment) => midpointNm >= segment.startNm && midpointNm <= segment.endNm)
            .map((segment) => Number(segment.lowerFt))
            .filter(Number.isFinite)
            .sort((left, right) => left - right);

        if (activeFloors.length === 0) {
            continue;
        }

        const startGroundFt = getGroundElevationAtAlongNm(elevationSamples, startNm);
        const endGroundFt = getGroundElevationAtAlongNm(elevationSamples, endNm);
        const avgGroundFt = (startGroundFt + endGroundFt) / 2;
        const upperFt = activeFloors[0];
        if (!Number.isFinite(avgGroundFt) || !Number.isFinite(upperFt) || upperFt <= avgGroundFt + 50) {
            continue;
        }

        segments.push({
            startNm,
            endNm,
            startGroundFt,
            endGroundFt,
            upperFt,
        });
    }

    return mergeClassGSegments(segments);
}

function buildClassGBoundaries(projectedSegments, elevationSamples) {
    const boundaries = new Set();
    elevationSamples.forEach((sample) => {
        if (Number.isFinite(Number(sample.alongNm))) {
            boundaries.add(Number(sample.alongNm));
        }
    });
    projectedSegments.forEach((segment) => {
        if (Number.isFinite(Number(segment.startNm))) {
            boundaries.add(Number(segment.startNm));
        }
        if (Number.isFinite(Number(segment.endNm))) {
            boundaries.add(Number(segment.endNm));
        }
    });

    return Array.from(boundaries)
        .sort((left, right) => left - right)
        .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > 0.001);
}

function mergeClassGSegments(segments) {
    if (segments.length === 0) {
        return [];
    }

    const merged = [{ ...segments[0] }];
    for (let index = 1; index < segments.length; index += 1) {
        const current = segments[index];
        const last = merged[merged.length - 1];
        if (Math.abs(current.upperFt - last.upperFt) <= 120 && Math.abs(current.startNm - last.endNm) <= 0.001) {
            last.endNm = current.endNm;
            last.endGroundFt = current.endGroundFt;
            continue;
        }
        merged.push({ ...current });
    }

    return merged;
}

function buildTerrainPath(elevationSamples, xScale, yScale) {
    if (!Array.isArray(elevationSamples) || elevationSamples.length === 0) {
        return "";
    }

    const topPoints = elevationSamples.map((sample) => `${xScale(sample.alongNm).toFixed(1)},${yScale(Math.max(0, Number(sample.elevationFt) || 0)).toFixed(1)}`);
    const bottomY = yScale(0).toFixed(1);
    const firstX = xScale(elevationSamples[0].alongNm).toFixed(1);
    const lastX = xScale(elevationSamples[elevationSamples.length - 1].alongNm).toFixed(1);
    const polygonPoints = [`${firstX},${bottomY}`, ...topPoints, `${lastX},${bottomY}`].join(" ");

    return `
        <polygon points="${polygonPoints}" fill="${AIRSPACE_COLORS.TERRAIN.fill}" stroke="none"></polygon>
        <polyline points="${topPoints.join(" ")}" fill="none" stroke="${AIRSPACE_COLORS.TERRAIN.stroke}" stroke-width="2"></polyline>
    `;
}

function buildClassGPaths(classGSegments, xScale, yScale) {
    return classGSegments.map((segment) => {
        const points = [
            `${xScale(segment.startNm).toFixed(1)},${yScale(segment.upperFt).toFixed(1)}`,
            `${xScale(segment.endNm).toFixed(1)},${yScale(segment.upperFt).toFixed(1)}`,
            `${xScale(segment.endNm).toFixed(1)},${yScale(Math.max(0, segment.endGroundFt)).toFixed(1)}`,
            `${xScale(segment.startNm).toFixed(1)},${yScale(Math.max(0, segment.startGroundFt)).toFixed(1)}`,
        ].join(" ");

        return `<polygon points="${points}" fill="${AIRSPACE_COLORS.G.fill}" stroke="${AIRSPACE_COLORS.G.stroke}" stroke-width="1.5"></polygon>`;
    }).join("");
}

function buildAirspaceCacheKey(bounds) {
    return [
        AIRSPACE_CLASSES,
        normalizeAirspaceBoundsValue(bounds.minLat),
        normalizeAirspaceBoundsValue(bounds.minLon),
        normalizeAirspaceBoundsValue(bounds.maxLat),
        normalizeAirspaceBoundsValue(bounds.maxLon),
    ].join("|");
}

function buildAirspaceRouteCacheKey(routeSignature) {
    if (!routeSignature) {
        return "";
    }
    return `route|${AIRSPACE_CLASSES}|${routeSignature}`;
}

function normalizeAirspaceBoundsValue(value) {
    return Number(value).toFixed(3);
}

function loadCachedAirspace(cacheKey, requestedBounds, routeCacheKey) {
    const cache = readAirspaceCache();
    const entry = cache[cacheKey];
    if (entry && isUsableAirspaceCacheEntry(entry, null)) {
        return entry.payload || null;
    }

    if (routeCacheKey && isUsableAirspaceCacheEntry(cache[routeCacheKey], null)) {
        return cache[routeCacheKey].payload || null;
    }

    const fallback = Object.values(cache).find((candidate) => isUsableAirspaceCacheEntry(candidate, requestedBounds));
    if (fallback) {
        return fallback.payload || null;
    }

    pruneExpiredAirspaceCache(cache);
    return null;
}

function cacheAirspace(cacheKey, payload, requestedBounds, routeCacheKey) {
    const cache = readAirspaceCache();
    const entry = {
        savedAt: Date.now(),
        payload,
        bounds: requestedBounds,
        classes: AIRSPACE_CLASSES,
    };
    cache[cacheKey] = entry;
    if (routeCacheKey) {
        cache[routeCacheKey] = entry;
    }
    writeAirspaceCache(cache);
}

function readAirspaceCache() {
    try {
        const parsed = loadAirspaceCache();
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        return {};
    }
}

function writeAirspaceCache(cache) {
    try {
        saveAirspaceCache(cache);
    } catch (error) {
        // Ignore storage failures and continue without persistent cache.
    }
}

function isUsableAirspaceCacheEntry(entry, requestedBounds) {
    if (!entry?.savedAt || Date.now() - Number(entry.savedAt) > AIRSPACE_CACHE_TTL_MS) {
        return false;
    }

    if (!requestedBounds) {
        return true;
    }

    return boundsContain(entry.bounds, requestedBounds);
}

function pruneExpiredAirspaceCache(cache) {
    let changed = false;
    Object.entries(cache).forEach(([key, entry]) => {
        if (!entry?.savedAt || Date.now() - Number(entry.savedAt) > AIRSPACE_CACHE_TTL_MS) {
            delete cache[key];
            changed = true;
        }
    });
    if (changed) {
        writeAirspaceCache(cache);
    }
}

function boundsContain(outer, inner) {
    if (!outer || !inner) {
        return false;
    }

    return outer.minLat <= inner.minLat
        && outer.minLon <= inner.minLon
        && outer.maxLat >= inner.maxLat
        && outer.maxLon >= inner.maxLon;
}

function calculateDistanceNm(lat1, lon1, lat2, lon2) {
    const radiusNm = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
        * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radiusNm * c;
}

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}

function showLoadingProgress(message, progress) {
    loadingProgress.classList.add("active");
    loadingProgressLabel.textContent = message;
    loadingProgressBar.style.width = `${clamp(progress, 0, 100)}%`;
}

function hideLoadingProgress() {
    loadingProgress.classList.remove("active");
    loadingProgressBar.style.width = "0%";
}

function isUsableDraft(draft) {
    return draft
        && draft.departure
        && Array.isArray(draft.legs)
        && draft.legs.length > 0
        && String(draft.departure.icao || "").trim().length === 4
        && Number.isFinite(Number(draft.departure.lat))
        && Number.isFinite(Number(draft.departure.lon))
        && draft.legs.some((leg) => String(leg?.icao || "").trim().length === 4
            && Number.isFinite(Number(leg.lat))
            && Number.isFinite(Number(leg.lon)));
}

function renderEmptyState(message) {
    profileRoot.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderSetupRequiredState(message) {
    profileRoot.innerHTML = `
        <div class="empty-state setup-required-state">
            <h2>Set Up a Flight First</h2>
            <p>${escapeHtml(message)}</p>
            <div class="empty-state-actions">
                <a class="link-button" href="/index.html">Go to Flight Setup</a>
            </div>
        </div>
    `;
}

function showStatus(message, type = "info") {
    statusBanner.textContent = message;
    statusBanner.className = "status-banner";
    statusBanner.classList.add(type);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("\"", "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}
