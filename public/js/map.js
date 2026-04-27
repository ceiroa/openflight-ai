import {
    getCheckpointPlanForRoute,
    loadFlightDraft,
} from "./flightStore.js";

const FAA_VFR_CHARTS_URL = "https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/vfr/index.cfm";
const FAA_SECTIONAL_INFO_URL = "https://www.faa.gov/air_traffic/flight_info/aeronav/productcatalog/vfrcharts/sectional/";
const FAA_TAC_INFO_URL = "https://www.faa.gov/air_traffic/flight_info/aeronav/productcatalog/vfrcharts/terminalarea/";

const SECTIONAL_CHARTS = [
    { name: "Chicago Sectional", lat: 41.8781, lon: -87.6298, type: "sectional" },
    { name: "St. Louis Sectional", lat: 38.627, lon: -90.1994, type: "sectional" },
    { name: "Twin Cities Sectional", lat: 44.9778, lon: -93.265, type: "sectional" },
    { name: "Detroit Sectional", lat: 42.3314, lon: -83.0458, type: "sectional" },
    { name: "Omaha Sectional", lat: 41.2565, lon: -95.9345, type: "sectional" },
    { name: "Kansas City Sectional", lat: 39.0997, lon: -94.5786, type: "sectional" },
    { name: "Denver Sectional", lat: 39.7392, lon: -104.9903, type: "sectional" },
    { name: "Dallas-Ft Worth Sectional", lat: 32.7767, lon: -96.797, type: "sectional" },
    { name: "Houston Sectional", lat: 29.7604, lon: -95.3698, type: "sectional" },
    { name: "Atlanta Sectional", lat: 33.749, lon: -84.388, type: "sectional" },
    { name: "Charlotte Sectional", lat: 35.2271, lon: -80.8431, type: "sectional" },
    { name: "Washington Sectional", lat: 38.9072, lon: -77.0369, type: "sectional" },
    { name: "New York Sectional", lat: 40.7128, lon: -74.006, type: "sectional" },
    { name: "Jacksonville Sectional", lat: 30.3322, lon: -81.6557, type: "sectional" },
    { name: "Miami Sectional", lat: 25.7617, lon: -80.1918, type: "sectional" },
    { name: "New Orleans Sectional", lat: 29.9511, lon: -90.0715, type: "sectional" },
    { name: "Phoenix Sectional", lat: 33.4484, lon: -112.074, type: "sectional" },
    { name: "Salt Lake City Sectional", lat: 40.7608, lon: -111.891, type: "sectional" },
    { name: "Seattle Sectional", lat: 47.6062, lon: -122.3321, type: "sectional" },
    { name: "San Francisco Sectional", lat: 37.7749, lon: -122.4194, type: "sectional" },
    { name: "Los Angeles Sectional", lat: 34.0522, lon: -118.2437, type: "sectional" },
    { name: "Las Vegas Sectional", lat: 36.1699, lon: -115.1398, type: "sectional" },
];

const TAC_CHARTS = [
    { name: "Chicago TAC", lat: 41.8781, lon: -87.6298, type: "tac" },
    { name: "Dallas-Ft Worth TAC", lat: 32.7767, lon: -96.797, type: "tac" },
    { name: "Atlanta TAC", lat: 33.749, lon: -84.388, type: "tac" },
    { name: "Houston TAC", lat: 29.7604, lon: -95.3698, type: "tac" },
    { name: "Los Angeles TAC", lat: 34.0522, lon: -118.2437, type: "tac" },
    { name: "New York TAC", lat: 40.7128, lon: -74.006, type: "tac" },
    { name: "Seattle/Portland TAC", lat: 45.965, lon: -122.65, type: "tac" },
    { name: "Phoenix TAC", lat: 33.4484, lon: -112.074, type: "tac" },
    { name: "Denver TAC", lat: 39.7392, lon: -104.9903, type: "tac" },
];

const MAP_MODES = {
    street: "street",
    terrain: "terrain",
    sectional: "sectional",
};

const LEG_COLORS = [
    "#38bdf8",
    "#f59e0b",
    "#10b981",
    "#f43f5e",
    "#a78bfa",
    "#22d3ee",
];

const statusBanner = document.getElementById("status-banner");
const mapRoot = document.getElementById("map-root");
const menuToggleButton = document.getElementById("menu-toggle");
const sideMenu = document.getElementById("side-menu");

const state = {
    map: null,
    baseLayers: {},
    routeLines: [],
    routeBounds: null,
    routePoints: [],
    legSegments: [],
    checkpointMarkers: [],
    checkpointButtons: [],
    activeCheckpointIndex: null,
    activeLegIndex: null,
    currentMode: MAP_MODES.street,
};

document.addEventListener("DOMContentLoaded", () => {
    menuToggleButton.addEventListener("click", () => {
        sideMenu.classList.toggle("open");
        menuToggleButton.classList.toggle("open");
    });

    const draft = loadFlightDraft();
    if (!isUsableDraft(draft)) {
        renderEmptyState("Load the flight on the main page first, then open the map.");
        return;
    }

    renderMapPage(draft);
});

function renderMapPage(draft) {
    const routePoints = buildRoutePoints(draft);
    const legSegments = buildLegSegments(routePoints);
    const checkpointPlan = getCheckpointPlanForRoute(draft);
    const checkpointMarkers = buildCheckpointMarkers(routePoints, checkpointPlan);
    const chartReferences = buildChartReferences(routePoints);

    mapRoot.innerHTML = `
        <div class="map-layout">
            <section class="map-panel">
                <h2>Route Plot</h2>
                <div class="map-toolbar">
                    <button type="button" class="map-mode-button active" data-map-mode="${MAP_MODES.street}">Street</button>
                    <button type="button" class="map-mode-button" data-map-mode="${MAP_MODES.terrain}">Terrain</button>
                    <button type="button" class="map-mode-button" data-map-mode="${MAP_MODES.sectional}">FAA Sectional Ref</button>
                    <button type="button" class="map-export-button" id="export-kml-btn">Export KML</button>
                </div>
                <p id="map-status" class="route-summary">Route plotted for ${draft.legs.length} leg${draft.legs.length === 1 ? "" : "s"}.</p>
                <div id="route-map" role="img" aria-label="Map of the current route"></div>
            </section>
            <aside class="route-panel">
                <h2>Route Summary</h2>
                <p class="route-summary"><strong>Departure:</strong> ${escapeHtml(draft.departure.icao)}</p>
                <ol class="route-list">
                    ${legSegments.map((segment) => `
                        <li>Leg ${segment.index + 1}: ${escapeHtml(segment.fromIcao)} to ${escapeHtml(segment.toIcao)}</li>
                    `).join("")}
                </ol>
                <div class="leg-controls">
                    ${legSegments.map((segment) => `
                        <div class="leg-control" data-leg-control="${segment.index}">
                            <div class="leg-control-name">
                                <span class="leg-swatch leg-swatch-color-${segment.index % LEG_COLORS.length}"></span>
                                <span>Leg ${segment.index + 1}: ${escapeHtml(segment.fromIcao)} to ${escapeHtml(segment.toIcao)}</span>
                            </div>
                            <div class="leg-actions">
                                <label>
                                    <input type="checkbox" data-leg-toggle="${segment.index}" checked>
                                    Show
                                </label>
                                <button type="button" class="leg-highlight-button" data-leg-highlight="${segment.index}">Focus</button>
                            </div>
                        </div>
                    `).join("")}
                </div>
                <h3>Saved Checkpoints</h3>
                ${checkpointMarkers.length === 0
                    ? `<div class="empty-state">No saved checkpoints for this route yet.</div>`
                    : `
                        <ol class="checkpoint-list">
                            ${checkpointMarkers.map((checkpoint, index) => `
                                <li>
                                    <button type="button" class="checkpoint-button" data-checkpoint-index="${index}">
                                        ${escapeHtml(checkpoint.name)}
                                        <span class="checkpoint-subtitle">${escapeHtml(checkpoint.fromIcao)} to ${escapeHtml(checkpoint.toIcao)} at ${checkpoint.distanceFromLegStartNm.toFixed(1)} NM</span>
                                    </button>
                                </li>
                            `).join("")}
                        </ol>
                    `}
                <h3>FAA Chart Reference</h3>
                <div id="chart-reference-list" class="chart-list">
                    ${chartReferences.map((chart) => `
                        <a class="chart-link-button" href="${escapeHtml(chart.url)}" target="_blank" rel="noreferrer">
                            ${escapeHtml(chart.name)}
                            <span class="chart-description">${escapeHtml(chart.description)}</span>
                        </a>
                    `).join("")}
                </div>
                <p id="sectional-note" class="sectional-note">FAA publishes sectional and TAC files as downloads, not ready-made browser tile layers. This mode helps you identify the likely official charts for the plotted route while keeping a free live map underneath.</p>
            </aside>
        </div>
    `;

    if (!window.L) {
        showStatus("Map library failed to load. Route summary is still available on this page.", "error");
        return;
    }

    state.routePoints = routePoints;
    state.legSegments = legSegments;
    state.checkpointMarkers = checkpointMarkers;
    initializeLeafletMap(routePoints, legSegments, checkpointMarkers);
    attachMapPageHandlers(checkpointMarkers);
    applyMapMode(MAP_MODES.street);
}

function initializeLeafletMap(routePoints, legSegments, checkpointMarkers) {
    const map = window.L.map("route-map", {
        zoomControl: true,
    });

    const streetLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });

    const terrainLayer = window.L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
        maxZoom: 17,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    });

    streetLayer.addTo(map);

    const routeLines = legSegments.map((segment) => window.L.polyline(segment.latLngs, {
        color: segment.color,
        weight: 4,
        opacity: 0.9,
    }).addTo(map));

    routePoints.forEach((point, index) => {
        const marker = window.L.circleMarker([point.lat, point.lon], {
            radius: index === 0 ? 8 : 6,
            color: index === 0 ? "#10b981" : "#f8fafc",
            fillColor: index === 0 ? "#10b981" : "#38bdf8",
            fillOpacity: 0.95,
            weight: 2,
        }).addTo(map);

        marker.bindPopup(`<strong>${escapeHtml(point.icao)}</strong><br>${index === 0 ? "Departure" : `Leg ${index}`}`);
    });

    checkpointMarkers.forEach((checkpoint, index) => {
        checkpoint.marker = window.L.circleMarker([checkpoint.lat, checkpoint.lon], {
            radius: 6,
            color: "#f59e0b",
            fillColor: "#f59e0b",
            fillOpacity: 0.95,
            weight: 2,
        }).addTo(map);

        checkpoint.marker.bindPopup(`<strong>${escapeHtml(checkpoint.name)}</strong><br>${escapeHtml(checkpoint.fromIcao)} to ${escapeHtml(checkpoint.toIcao)}`);
        checkpoint.marker.on("click", () => highlightCheckpoint(index));
    });

    const routeGroup = window.L.featureGroup(routeLines);
    map.fitBounds(routeGroup.getBounds(), {
        padding: [30, 30],
    });

    state.map = map;
    state.baseLayers = {
        street: streetLayer,
        terrain: terrainLayer,
    };
    state.routeLines = routeLines;
    state.routeBounds = routeGroup.getBounds();
}

function attachMapPageHandlers(checkpointMarkers) {
    document.querySelectorAll("[data-map-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            applyMapMode(button.getAttribute("data-map-mode"));
        });
    });

    document.querySelectorAll("[data-leg-toggle]").forEach((input) => {
        input.addEventListener("change", () => {
            toggleLegVisibility(Number(input.getAttribute("data-leg-toggle")), input.checked);
        });
    });

    document.querySelectorAll("[data-leg-highlight]").forEach((button) => {
        button.addEventListener("click", () => {
            focusLeg(Number(button.getAttribute("data-leg-highlight")));
        });
    });

    state.checkpointButtons = Array.from(document.querySelectorAll("[data-checkpoint-index]"));
    state.checkpointButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const checkpointIndex = Number(button.getAttribute("data-checkpoint-index"));
            highlightCheckpoint(checkpointIndex);
        });
    });

    if (checkpointMarkers.length > 0) {
        highlightCheckpoint(0, false);
    }

    document.getElementById("export-kml-btn")?.addEventListener("click", exportCurrentRouteKml);
}

function applyMapMode(mode) {
    state.currentMode = mode;
    document.querySelectorAll("[data-map-mode]").forEach((button) => {
        button.classList.toggle("active", button.getAttribute("data-map-mode") === mode);
    });

    if (!state.map) {
        return;
    }

    if (state.map.hasLayer(state.baseLayers.street)) {
        state.map.removeLayer(state.baseLayers.street);
    }
    if (state.map.hasLayer(state.baseLayers.terrain)) {
        state.map.removeLayer(state.baseLayers.terrain);
    }

    if (mode === MAP_MODES.street) {
        state.baseLayers.street.addTo(state.map);
        state.routeLines.forEach((line, index) => line.setStyle({ color: state.legSegments[index].color, weight: 4, dashArray: null }));
        updateMapStatus("Street map mode. Route, airports, and checkpoints are plotted on OpenStreetMap.");
    } else if (mode === MAP_MODES.terrain) {
        state.baseLayers.terrain.addTo(state.map);
        state.routeLines.forEach((line, index) => line.setStyle({ color: state.legSegments[index].color, weight: 4, dashArray: null }));
        updateMapStatus("Terrain mode. Use this to compare the route to terrain and surface features.");
    } else {
        state.baseLayers.terrain.addTo(state.map);
        state.routeLines.forEach((line) => line.setStyle({ color: "#f59e0b", weight: 5, dashArray: "10 8" }));
        updateMapStatus("FAA sectional reference mode. Review the route on terrain and use the chart links on the right for official FAA VFR charts.");
    }
}

function toggleLegVisibility(legIndex, isVisible) {
    const line = state.routeLines[legIndex];
    if (!line || !state.map) {
        return;
    }

    if (isVisible) {
        line.addTo(state.map);
    } else if (state.map.hasLayer(line)) {
        state.map.removeLayer(line);
    }

    if (state.activeLegIndex === legIndex && !isVisible) {
        state.activeLegIndex = null;
        document.querySelectorAll("[data-leg-control]").forEach((element) => {
            element.classList.remove("active");
        });
    }
}

function focusLeg(legIndex) {
    const line = state.routeLines[legIndex];
    if (!line || !state.map) {
        return;
    }

    state.activeLegIndex = legIndex;
    state.routeLines.forEach((routeLine, index) => {
        const baseColor = state.currentMode === MAP_MODES.sectional ? "#f59e0b" : state.legSegments[index].color;
        routeLine.setStyle({
            color: baseColor,
            weight: index === legIndex ? 7 : (state.currentMode === MAP_MODES.sectional ? 5 : 4),
            opacity: index === legIndex ? 1 : 0.55,
            dashArray: state.currentMode === MAP_MODES.sectional ? "10 8" : null,
        });
    });

    document.querySelectorAll("[data-leg-control]").forEach((element) => {
        element.classList.toggle("active", Number(element.getAttribute("data-leg-control")) === legIndex);
    });

    state.map.fitBounds(line.getBounds(), {
        padding: [40, 40],
    });
}

function highlightCheckpoint(index, pan = true) {
    state.activeCheckpointIndex = index;

    state.checkpointMarkers.forEach((checkpoint, markerIndex) => {
        if (!checkpoint.marker) {
            return;
        }

        const isActive = markerIndex === index;
        checkpoint.marker.setStyle({
            radius: isActive ? 8 : 6,
            color: isActive ? "#f8fafc" : "#f59e0b",
            fillColor: isActive ? "#ef4444" : "#f59e0b",
            fillOpacity: 0.95,
            weight: 2,
        });
    });

    state.checkpointButtons.forEach((button, buttonIndex) => {
        button.classList.toggle("active", buttonIndex === index);
    });

    const checkpoint = state.checkpointMarkers[index];
    if (!checkpoint || !checkpoint.marker) {
        return;
    }

    checkpoint.marker.openPopup();
    if (pan && state.map) {
        state.map.flyTo([checkpoint.lat, checkpoint.lon], Math.max(state.map.getZoom(), 9), {
            animate: true,
            duration: 0.75,
        });
    }
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

function buildLegSegments(routePoints) {
    return routePoints.slice(0, -1).map((point, index) => ({
        index,
        fromIcao: point.icao,
        toIcao: routePoints[index + 1].icao,
        latLngs: [
            [point.lat, point.lon],
            [routePoints[index + 1].lat, routePoints[index + 1].lon],
        ],
        color: LEG_COLORS[index % LEG_COLORS.length],
    }));
}

function buildCheckpointMarkers(routePoints, checkpointPlan) {
    if (!Array.isArray(checkpointPlan?.legs)) {
        return [];
    }

    return checkpointPlan.legs.flatMap((leg, legIndex) => {
        const checkpoints = Array.isArray(leg.checkpoints) ? leg.checkpoints : [];
        if (checkpoints.length === 0) {
            return [];
        }

        const fromPoint = routePoints[legIndex];
        const toPoint = routePoints[legIndex + 1];
        const legDistanceNm = calculateDistanceNm(fromPoint.lat, fromPoint.lon, toPoint.lat, toPoint.lon);

        return checkpoints.map((checkpoint) => {
            const distanceFromLegStartNm = Number(checkpoint.distanceFromLegStartNm) || 0;
            const fraction = legDistanceNm === 0
                ? 0
                : Math.max(0, Math.min(1, distanceFromLegStartNm / legDistanceNm));

            return {
                name: checkpoint.name || "Checkpoint",
                comms: checkpoint.comms || "VIS",
                fromIcao: leg.fromIcao,
                toIcao: leg.toIcao,
                distanceFromLegStartNm,
                lat: fromPoint.lat + ((toPoint.lat - fromPoint.lat) * fraction),
                lon: fromPoint.lon + ((toPoint.lon - fromPoint.lon) * fraction),
            };
        });
    });
}

function buildChartReferences(routePoints) {
    if (!routePoints.every((point) => isConterminousUsPoint(point.lat, point.lon))) {
        return [{
            name: "FAA VFR Raster Charts",
            description: "Open the official FAA chart catalog for routes outside the conterminous U.S. or mixed-coverage routes.",
            url: FAA_VFR_CHARTS_URL,
        }];
    }

    const centroid = calculateRouteCentroid(routePoints);
    const nearestSectionals = SECTIONAL_CHARTS
        .map((chart) => ({ ...chart, distanceNm: calculateDistanceNm(centroid.lat, centroid.lon, chart.lat, chart.lon) }))
        .sort((a, b) => a.distanceNm - b.distanceNm)
        .slice(0, 2);

    const nearestTac = TAC_CHARTS
        .map((chart) => ({ ...chart, distanceNm: calculateDistanceNm(centroid.lat, centroid.lon, chart.lat, chart.lon) }))
        .sort((a, b) => a.distanceNm - b.distanceNm)
        .find((chart) => chart.distanceNm <= 120);

    const references = nearestSectionals.map((chart, index) => ({
        name: chart.name,
        description: `${index === 0 ? "Primary likely sectional" : "Nearby sectional alternative"} for this route. Open the official FAA chart pages for current PDF/GeoTIFF downloads.`,
        url: FAA_SECTIONAL_INFO_URL,
    }));

    if (nearestTac) {
        references.push({
            name: nearestTac.name,
            description: "Likely TAC coverage if you want a larger-scale chart around the metro area.",
            url: FAA_TAC_INFO_URL,
        });
    }

    references.push({
        name: "FAA VFR Raster Charts",
        description: "Official FAA digital chart download page for current PDF and GeoTIFF files.",
        url: FAA_VFR_CHARTS_URL,
    });

    return references;
}

function calculateRouteCentroid(routePoints) {
    const totals = routePoints.reduce((accumulator, point) => ({
        lat: accumulator.lat + point.lat,
        lon: accumulator.lon + point.lon,
    }), { lat: 0, lon: 0 });

    return {
        lat: totals.lat / routePoints.length,
        lon: totals.lon / routePoints.length,
    };
}

function isConterminousUsPoint(lat, lon) {
    return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
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

function exportCurrentRouteKml() {
    if (state.routePoints.length === 0) {
        return;
    }

    const routeCoordinates = state.routePoints
        .map((point) => `${point.lon},${point.lat},0`)
        .join(" ");

    const checkpointPlacemarks = state.checkpointMarkers.map((checkpoint) => `
        <Placemark>
            <name>${escapeXml(checkpoint.name)}</name>
            <description>${escapeXml(`${checkpoint.fromIcao} to ${checkpoint.toIcao} | ${checkpoint.comms}`)}</description>
            <Point>
                <coordinates>${checkpoint.lon},${checkpoint.lat},0</coordinates>
            </Point>
        </Placemark>
    `).join("");

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>OpenFlight Route</name>
    <Placemark>
      <name>Route</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${routeCoordinates}</coordinates>
      </LineString>
    </Placemark>
    ${checkpointPlacemarks}
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "openflight-route.kml";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function updateMapStatus(message) {
    const status = document.getElementById("map-status");
    if (status) {
        status.textContent = message;
    }
}

function isUsableDraft(draft) {
    return draft
        && draft.departure
        && Array.isArray(draft.legs)
        && draft.legs.length > 0
        && Number.isFinite(Number(draft.departure.lat))
        && Number.isFinite(Number(draft.departure.lon))
        && draft.legs.every((leg) => Number.isFinite(Number(leg.lat)) && Number.isFinite(Number(leg.lon)));
}

function renderEmptyState(message) {
    mapRoot.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
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

function escapeXml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("\"", "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}
