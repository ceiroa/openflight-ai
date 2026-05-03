import {
    createRouteSignature,
    getCheckpointPlanForRoute,
    loadFlightDraft,
    loadAirspaceCache,
    loadWeatherCache,
    saveAirspaceCache,
    saveWeatherCache,
} from "./flightStore.js";

const FAA_VFR_CHARTS_URL = "https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/vfr/index.cfm";
const FAA_SECTIONAL_INFO_URL = "https://www.faa.gov/air_traffic/flight_info/aeronav/productcatalog/vfrcharts/sectional/";
const FAA_TAC_INFO_URL = "https://www.faa.gov/air_traffic/flight_info/aeronav/productcatalog/vfrcharts/terminalarea/";
const AIRSPACE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const WEATHER_FETCH_TIMEOUT_MS = 15000;
const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;

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
const container = document.querySelector(".container");

const state = {
    map: null,
    baseLayers: {},
    sectionalOverlayLayer: null,
    sectionalOverlayMetadata: null,
    sectionalOverlayPromise: null,
    routeLines: [],
    routeBounds: null,
    routePoints: [],
    legSegments: [],
    airportMarkers: [],
    weatherMarkersVisible: false,
    areaWeatherMarkers: [],
    checkpointMarkers: [],
    checkpointButtons: [],
    referenceCheckpointMarkers: [],
    showReferenceCheckpoints: false,
    mapMaximized: false,
    activeCheckpointIndex: null,
    activeLegIndex: null,
    currentMode: MAP_MODES.street,
    checkpointFilters: {
        type: "all",
        source: "all",
    },
    routePanelCollapsed: false,
    currentLocationMarker: null,
    currentLocationAccuracyCircle: null,
    locationWatchId: null,
    showCurrentLocation: false,
    airspaceLayer: null,
    showAirspace: false,
    routeSignature: "",
    weatherByIcao: new Map(),
};

document.addEventListener("DOMContentLoaded", () => {
    menuToggleButton.addEventListener("click", () => {
        setMenuOpenState(!sideMenu.classList.contains("open"));
    });
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("keydown", handleDocumentKeydown);

    const draft = loadFlightDraft();
    if (!isUsableDraft(draft)) {
        renderEmptyState("Load the flight on the main page first, then open the map.");
        return;
    }

    renderMapPage(draft);
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

function renderMapPage(draft) {
    state.airportMarkers = [];
    state.weatherByIcao = new Map();
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
                    <button type="button" class="map-secondary-button" id="toggle-airspace-btn">Show FAA Airspace</button>
                    <button type="button" class="map-secondary-button" id="toggle-weather-btn">Show Airport Weather Layer</button>
                    <button type="button" class="map-secondary-button" id="toggle-location-btn">Show Current Location</button>
                    <button type="button" class="map-secondary-button" id="toggle-reference-checkpoints-btn">Show Nearby Reference Checkpoints</button>
                    <span class="map-toolbar-spacer"></span>
                    <button type="button" class="map-export-button" id="export-kml-btn">Export KML</button>
                </div>
                <div class="map-status-stack">
                    <p id="map-status" class="route-summary">Route plotted for ${draft.legs.length} leg${draft.legs.length === 1 ? "" : "s"}.</p>
                    <p id="map-weather-status" class="map-weather-status">Loading airport weather for this route...</p>
                </div>
                <div class="route-map-shell">
                    <button type="button" class="map-secondary-button map-overlay-button" id="maximize-map-btn">Maximize Map</button>
                    <button type="button" class="map-secondary-button map-overlay-button map-recenter-button" id="recenter-route-btn">Recenter Route</button>
                    <button type="button" class="map-secondary-button map-overlay-button map-panel-toggle-button" id="toggle-route-panel-btn">Hide Panel</button>
                    <div id="route-map" role="img" aria-label="Map of the current route"></div>
                </div>
            </section>
            <aside class="route-panel" id="route-panel">
                <h2>Route Summary</h2>
                <section class="route-summary-section collapsed" data-accordion-section="overview">
                    <button type="button" class="route-section-toggle" data-accordion-toggle="overview" aria-expanded="false">
                        <span>Route Overview</span>
                        <span class="route-section-chevron" aria-hidden="true">+</span>
                    </button>
                    <div class="route-section-content" data-accordion-content="overview">
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
                    </div>
                </section>
                <section class="route-summary-section collapsed" data-accordion-section="weather">
                    <button type="button" class="route-section-toggle" data-accordion-toggle="weather" aria-expanded="false">
                        <span>Weather Along Route</span>
                        <span class="route-section-chevron" aria-hidden="true">+</span>
                    </button>
                    <div class="route-section-content" data-accordion-content="weather">
                        <div id="route-weather-list" class="route-weather-list">
                            ${routePoints.map((point) => `
                                <article class="route-weather-item loading" data-weather-row="${escapeHtml(point.icao)}" data-weather-role="${escapeHtml(point.roleLabel)}">
                                    <div class="route-weather-head">
                                        <span class="route-weather-airport">${escapeHtml(point.icao)}</span>
                                        <span class="route-weather-badge">Loading</span>
                                    </div>
                                    <div class="route-weather-role">${escapeHtml(point.roleLabel)}</div>
                                    <div class="route-weather-note">Loading airport weather...</div>
                                </article>
                            `).join("")}
                        </div>
                    </div>
                </section>
                <section class="route-summary-section collapsed" data-accordion-section="checkpoints">
                    <button type="button" class="route-section-toggle" data-accordion-toggle="checkpoints" aria-expanded="false">
                        <span>Saved Checkpoints</span>
                        <span class="route-section-chevron" aria-hidden="true">+</span>
                    </button>
                    <div class="route-section-content" data-accordion-content="checkpoints">
                        <div class="checkpoint-filters">
                            <div class="checkpoint-filter-grid">
                                <div class="checkpoint-filter-group">
                                    <label for="map-checkpoint-type-filter">Filter By Type</label>
                                    <select id="map-checkpoint-type-filter">
                                        <option value="all">All Types</option>
                                        <option value="visual_checkpoint">Visual Checkpoints</option>
                                        <option value="airport">Airports</option>
                                        <option value="landmark">Landmarks</option>
                                        <option value="manual">Manual</option>
                                        <option value="synthetic">Synthetic</option>
                                    </select>
                                </div>
                                <div class="checkpoint-filter-group">
                                    <label for="map-checkpoint-source-filter">Filter By Source</label>
                                    <select id="map-checkpoint-source-filter">
                                        <option value="all">All Sources</option>
                                        <option value="curated_visual_checkpoint">Curated Visual</option>
                                        <option value="chart_candidate">Visual Priority</option>
                                        <option value="airport_reference">Airport Data</option>
                                        <option value="landmark">Landmark Search</option>
                                        <option value="user">User Added</option>
                                        <option value="fallback">Fallback</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        ${checkpointMarkers.length === 0
                            ? `<div class="empty-state">No saved checkpoints for this route yet.</div>`
                            : `
                                <ol class="checkpoint-list">
                                    ${checkpointMarkers.map((checkpoint, index) => `
                                        <li class="checkpoint-list-item" data-checkpoint-item="${index}">
                                            <button type="button" class="checkpoint-button" data-checkpoint-index="${index}">
                                                <span>${escapeHtml(checkpoint.name)}</span>
                                                ${renderCheckpointMeta(checkpoint)}
                                                <span class="checkpoint-subtitle">${escapeHtml(checkpoint.fromIcao)} to ${escapeHtml(checkpoint.toIcao)} at ${checkpoint.distanceFromLegStartNm.toFixed(1)} NM</span>
                                                ${checkpoint.notes ? `<span class="checkpoint-subtitle">${escapeHtml(checkpoint.notes)}</span>` : ""}
                                            </button>
                                        </li>
                                    `).join("")}
                                </ol>
                            `}
                    </div>
                </section>
                <section class="route-summary-section collapsed" data-accordion-section="charts">
                    <button type="button" class="route-section-toggle" data-accordion-toggle="charts" aria-expanded="false">
                        <span>FAA Chart Reference</span>
                        <span class="route-section-chevron" aria-hidden="true">+</span>
                    </button>
                    <div class="route-section-content" data-accordion-content="charts">
                        <div id="chart-reference-list" class="chart-list">
                            ${chartReferences.map((chart) => `
                                <a class="chart-link-button" href="${escapeHtml(chart.url)}" target="_blank" rel="noreferrer">
                                    ${escapeHtml(chart.name)}
                                    <span class="chart-description">${escapeHtml(chart.description)}</span>
                                </a>
                            `).join("")}
                        </div>
                        <p id="sectional-note" class="sectional-note">FAA publishes sectional and TAC files as downloads, not ready-made browser tile layers. This mode helps you identify the likely official charts for the plotted route while keeping a free live map underneath.</p>
                        <p class="reference-checkpoint-note">Nearby reference checkpoints come from the curated visual checkpoint dataset and are shown separately from the trip checkpoints.</p>
                    </div>
                </section>
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
    state.routeSignature = createRouteSignature(draft);
    initializeLeafletMap(routePoints, legSegments, checkpointMarkers);
    attachMapPageHandlers(checkpointMarkers);
    updateWeatherToggleButton();
    applyMapMode(MAP_MODES.street);
    void loadRouteWeather(draft, routePoints);
}

function initializeLeafletMap(routePoints, legSegments, checkpointMarkers) {
    const map = window.L.map("route-map", {
        zoomControl: true,
    });

    state.airportMarkers = [];

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

        marker.bindPopup(buildAirportPopup(point));
        state.airportMarkers.push({ ...point, marker, weatherLayer: null });
    });

    checkpointMarkers.forEach((checkpoint, index) => {
        const markerStyle = getCheckpointMarkerStyle(checkpoint);
        checkpoint.marker = window.L.circleMarker([checkpoint.lat, checkpoint.lon], {
            radius: markerStyle.radius,
            color: markerStyle.color,
            fillColor: markerStyle.fillColor,
            fillOpacity: 0.95,
            weight: 2,
        }).addTo(map);

        checkpoint.marker.bindPopup(buildCheckpointPopup(checkpoint));
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
    map.on("moveend", () => {
        if (state.showReferenceCheckpoints) {
            void refreshReferenceCheckpoints();
        }
        if (state.showAirspace) {
            void refreshAirspaceOverlay();
        }
        if (state.weatherMarkersVisible) {
            void refreshAreaWeatherLayer();
        }
    });
}

function attachMapPageHandlers(checkpointMarkers) {
    document.querySelectorAll("[data-map-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            applyMapMode(button.getAttribute("data-map-mode"));
        });
    });

    document.querySelectorAll("[data-accordion-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            toggleRouteSection(button.getAttribute("data-accordion-toggle"));
        });
        syncRouteSectionToggle(button.getAttribute("data-accordion-toggle"));
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
        highlightCheckpoint(0, false, false);
    }

    document.getElementById("map-checkpoint-type-filter")?.addEventListener("change", (event) => {
        state.checkpointFilters.type = event.target.value;
        applyCheckpointFilters();
    });
    document.getElementById("map-checkpoint-source-filter")?.addEventListener("change", (event) => {
        state.checkpointFilters.source = event.target.value;
        applyCheckpointFilters();
    });

    document.getElementById("export-kml-btn")?.addEventListener("click", exportCurrentRouteKml);
    document.getElementById("toggle-airspace-btn")?.addEventListener("click", () => {
        void toggleAirspaceOverlay();
    });
    document.getElementById("toggle-weather-btn")?.addEventListener("click", () => {
        toggleWeatherLayer();
    });
    document.getElementById("toggle-location-btn")?.addEventListener("click", () => {
        void toggleCurrentLocation();
    });
    document.getElementById("toggle-reference-checkpoints-btn")?.addEventListener("click", () => {
        void toggleReferenceCheckpoints();
    });
    document.getElementById("maximize-map-btn")?.addEventListener("click", toggleMapMaximized);
    document.getElementById("recenter-route-btn")?.addEventListener("click", recenterRouteMap);
    document.getElementById("toggle-route-panel-btn")?.addEventListener("click", toggleRoutePanel);
    applyCheckpointFilters();
    updateRoutePanelState();
}

function recenterRouteMap() {
    if (state.routeBounds) {
        state.map?.fitBounds(state.routeBounds, { padding: [30, 30] });
    }
}

function toggleRouteSection(sectionName) {
    const section = document.querySelector(`[data-accordion-section="${sectionName}"]`);
    const toggle = document.querySelector(`[data-accordion-toggle="${sectionName}"]`);
    if (!section || !toggle) {
        return;
    }

    const isCollapsed = section.classList.contains("collapsed");
    section.classList.toggle("collapsed", !isCollapsed);
    syncRouteSectionToggle(sectionName);
}

function syncRouteSectionToggle(sectionName) {
    const section = document.querySelector(`[data-accordion-section="${sectionName}"]`);
    const toggle = document.querySelector(`[data-accordion-toggle="${sectionName}"]`);
    const chevron = toggle?.querySelector(".route-section-chevron");
    if (!section || !toggle || !chevron) {
        return;
    }

    const isExpanded = !section.classList.contains("collapsed");
    toggle.setAttribute("aria-expanded", String(isExpanded));
    chevron.textContent = isExpanded ? "−" : "+";
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
        removeSectionalOverlay();
        state.baseLayers.street.addTo(state.map);
        state.routeLines.forEach((line, index) => line.setStyle({ color: state.legSegments[index].color, weight: 4, dashArray: null }));
        updateMapStatus("Street map mode. Route, airports, and checkpoints are plotted on OpenStreetMap.");
    } else if (mode === MAP_MODES.terrain) {
        removeSectionalOverlay();
        state.baseLayers.terrain.addTo(state.map);
        state.routeLines.forEach((line, index) => line.setStyle({ color: state.legSegments[index].color, weight: 4, dashArray: null }));
        updateMapStatus("Terrain mode. Use this to compare the route to terrain and surface features.");
    } else {
        state.baseLayers.terrain.addTo(state.map);
        state.routeLines.forEach((line) => line.setStyle({ color: "#f59e0b", weight: 5, dashArray: "10 8" }));
        updateMapStatus("Loading FAA sectional overlay...");
        void ensureSectionalOverlay();
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

function highlightCheckpoint(index, pan = true, openPopup = true) {
    const checkpoint = state.checkpointMarkers[index];
    if (!checkpoint || !matchesCheckpointFilters(checkpoint)) {
        return;
    }

    state.activeCheckpointIndex = index;

    state.checkpointMarkers.forEach((checkpoint, markerIndex) => {
        if (!checkpoint.marker) {
            return;
        }

        const isActive = markerIndex === index;
        const markerStyle = getCheckpointMarkerStyle(checkpoint);
        checkpoint.marker.setStyle({
            radius: isActive ? Math.max(8, markerStyle.radius + 1) : markerStyle.radius,
            color: isActive ? "#f8fafc" : markerStyle.color,
            fillColor: isActive ? "#ef4444" : markerStyle.fillColor,
            fillOpacity: 0.95,
            weight: 2,
        });
    });

    state.checkpointButtons.forEach((button, buttonIndex) => {
        button.classList.toggle("active", buttonIndex === index);
    });

    if (!checkpoint.marker) {
        return;
    }

    if (openPopup) {
        checkpoint.marker.openPopup();
    } else {
        checkpoint.marker.closePopup();
    }
    if (pan && state.map) {
        state.map.flyTo([checkpoint.lat, checkpoint.lon], Math.max(state.map.getZoom(), 9), {
            animate: true,
            duration: 0.75,
        });
    }
}

function applyCheckpointFilters() {
    const items = Array.from(document.querySelectorAll("[data-checkpoint-item]"));

    state.checkpointMarkers.forEach((checkpoint, index) => {
        const isVisible = matchesCheckpointFilters(checkpoint);
        const listItem = items[index];

        if (listItem) {
            listItem.classList.toggle("is-hidden", !isVisible);
        }

        if (!checkpoint.marker || !state.map) {
            return;
        }

        if (isVisible) {
            checkpoint.marker.addTo(state.map);
        } else if (state.map.hasLayer(checkpoint.marker)) {
            checkpoint.marker.removeFrom(state.map);
        }
    });

    if (!state.checkpointMarkers.some(matchesCheckpointFilters)) {
        state.activeCheckpointIndex = null;
        state.checkpointButtons.forEach((button) => button.classList.remove("active"));
        return;
    }

    if (state.activeCheckpointIndex === null || !matchesCheckpointFilters(state.checkpointMarkers[state.activeCheckpointIndex])) {
        const nextVisibleIndex = state.checkpointMarkers.findIndex(matchesCheckpointFilters);
        if (nextVisibleIndex >= 0) {
            highlightCheckpoint(nextVisibleIndex, false);
        }
    }
}

function matchesCheckpointFilters(checkpoint) {
    const matchesType = state.checkpointFilters.type === "all" || checkpoint.type === state.checkpointFilters.type;
    const matchesSource = state.checkpointFilters.source === "all" || checkpoint.source === state.checkpointFilters.source;
    return matchesType && matchesSource;
}

function buildRoutePoints(draft) {
    return [
        {
            icao: draft.departure.icao,
            lat: Number(draft.departure.lat),
            lon: Number(draft.departure.lon),
            roleLabel: "Departure",
        },
        ...draft.legs.map((leg, index) => ({
            icao: leg.icao,
            lat: Number(leg.lat),
            lon: Number(leg.lon),
            roleLabel: `Leg ${index + 1} Destination`,
        })),
    ];
}

async function loadRouteWeather(draft, routePoints) {
    clearExpiredSharedWeatherCacheEntries();
    const uniqueAirports = Array.from(new Set(routePoints.map((point) => point.icao)));
    if (uniqueAirports.length === 0) {
        updateWeatherStatus("No route airports are available for weather loading.");
        return;
    }

    updateWeatherStatus(`Loading airport weather for ${uniqueAirports.length} route airport${uniqueAirports.length === 1 ? "" : "s"}...`);

    const results = await Promise.all(uniqueAirports.map(async (icao) => {
        try {
            const weather = getCachedWeather(icao, draft.date) || await fetchRouteWeather(icao, draft.date);
            state.weatherByIcao.set(icao, weather);
            updateWeatherRowsForAirport(icao, weather);
            refreshAirportMarkerPopup(icao);
            updateAirportWeatherLayer(icao);
            return { icao, ok: true, weather };
        } catch (error) {
            state.weatherByIcao.set(icao, { error: error.message });
            updateWeatherRowsForAirport(icao, null, error.message);
            refreshAirportMarkerPopup(icao);
            updateAirportWeatherLayer(icao);
            return { icao, ok: false, error: error.message };
        }
    }));

    const successCount = results.filter((result) => result.ok).length;
    const forecastCount = results.filter((result) => result.ok && result.weather?.forecast?.isForecast).length;
    const errorCount = results.length - successCount;

    if (successCount === 0) {
        updateWeatherStatus("No route airport weather could be loaded.");
        return;
    }

    const modeLabel = forecastCount > 0 ? "forecast" : "weather";
    const suffix = errorCount > 0 ? ` ${errorCount} airport${errorCount === 1 ? "" : "s"} could not be loaded.` : "";
    updateWeatherStatus(`Loaded ${modeLabel} for ${successCount} route airport${successCount === 1 ? "" : "s"}.${suffix}`);
}

async function fetchRouteWeather(icao, datetimeLocal) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(buildWeatherUrl(icao, datetimeLocal), {
            signal: controller.signal,
        });
        if (!response.ok) {
            const failure = await response.json().catch(() => ({ error: "Weather lookup failed." }));
            throw new Error(failure.error || `Weather lookup failed for ${icao}.`);
        }

        const payload = await response.json();
        validateWeatherData(payload, icao);
        cacheWeather(icao, datetimeLocal, payload);
        return payload;
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error(`Weather lookup timed out for ${icao}.`);
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function buildWeatherUrl(icao, datetimeLocal) {
    if (!datetimeLocal) {
        return `/api/weather/${icao}`;
    }

    const parsed = new Date(datetimeLocal);
    const datetime = Number.isFinite(parsed.getTime()) ? parsed.toISOString() : datetimeLocal;
    return `/api/weather/${icao}?datetime=${encodeURIComponent(datetime)}`;
}

function validateWeatherData(data, icao) {
    const requiredNumericFields = ["temperature", "altimeter", "windSpeed", "elevation", "lat", "lon"];
    const missingField = requiredNumericFields.find((field) => !Number.isFinite(Number(data[field])));
    if (missingField) {
        throw new Error(`Weather data for ${icao} is missing ${missingField}.`);
    }
}

function buildWeatherCacheKey(icao, datetimeValue = "") {
    return `${String(icao || "").trim().toUpperCase()}|${datetimeValue || "current"}`;
}

function readWeatherCache() {
    try {
        const parsed = loadWeatherCache();
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function cacheWeather(icao, datetimeValue, data) {
    const cache = readWeatherCache();
    cache[buildWeatherCacheKey(icao, datetimeValue)] = {
        savedAt: Date.now(),
        payload: data,
    };
    saveWeatherCache(cache);
}

function getCachedWeather(icao, datetimeValue) {
    const cache = readWeatherCache();
    const entry = cache[buildWeatherCacheKey(icao, datetimeValue)];
    if (!entry?.savedAt || Date.now() - Number(entry.savedAt) > WEATHER_CACHE_TTL_MS) {
        return null;
    }
    return entry.payload ?? null;
}

function clearExpiredSharedWeatherCacheEntries() {
    const cache = readWeatherCache();
    let changed = false;
    for (const [key, entry] of Object.entries(cache)) {
        if (!entry?.savedAt || Date.now() - Number(entry.savedAt) > WEATHER_CACHE_TTL_MS) {
            delete cache[key];
            changed = true;
        }
    }
    if (changed) {
        saveWeatherCache(cache);
    }
}

function updateWeatherRowsForAirport(icao, weather, errorMessage = "") {
    const rows = Array.from(document.querySelectorAll(`[data-weather-row="${icao}"]`));
    rows.forEach((row) => {
        const roleLabel = row.getAttribute("data-weather-role") || "";
        if (errorMessage) {
            row.className = "route-weather-item error";
            row.innerHTML = `
                <div class="route-weather-head">
                    <span class="route-weather-airport">${escapeHtml(icao)}</span>
                    <span class="route-weather-badge error">Unavailable</span>
                </div>
                <div class="route-weather-role">${escapeHtml(roleLabel)}</div>
                <div class="route-weather-note">${escapeHtml(errorMessage)}</div>
            `;
            return;
        }

        const modeLabel = weather?.forecast?.isForecast ? "Forecast" : "Observed";
        const sourceNote = weather?.forecast?.isForecast
            ? formatForecastWindow(weather.forecast)
            : weather?.weatherSourceIcao
                ? `From nearby station ${weather.weatherSourceIcao}`
                : "From FAA observation data";

        row.className = "route-weather-item";
        row.innerHTML = `
            <div class="route-weather-head">
                <span class="route-weather-airport">${escapeHtml(icao)}</span>
                <span class="route-weather-badge ${weather?.forecast?.isForecast ? "forecast" : "observed"}">${escapeHtml(modeLabel)}</span>
            </div>
            <div class="route-weather-role">${escapeHtml(roleLabel)}</div>
            <div class="route-weather-values">
                <span>${escapeHtml(formatTemperature(weather.temperature))}</span>
                <span>${escapeHtml(formatWind(weather.windDirection, weather.windSpeed))}</span>
                <span>${escapeHtml(formatAltimeter(weather.altimeter))}</span>
            </div>
            <div class="route-weather-note">${escapeHtml(sourceNote)}</div>
        `;
    });
}

function refreshAirportMarkerPopup(icao) {
    state.airportMarkers
        .filter((entry) => entry.icao === icao)
        .forEach((entry) => {
            entry.marker.bindPopup(buildAirportPopup(entry));
        });
}

function toggleWeatherLayer() {
    state.weatherMarkersVisible = !state.weatherMarkersVisible;
    updateWeatherToggleButton();
    if (!state.weatherMarkersVisible) {
        state.airportMarkers.forEach((entry) => removeAirportWeatherLayer(entry));
        clearAreaWeatherMarkers();
        updateWeatherLayerStatus("Airport weather layer is off.");
        return;
    }

    state.airportMarkers.forEach((entry) => ensureAirportWeatherLayer(entry));
    void refreshAreaWeatherLayer();
}

function updateWeatherToggleButton() {
    const button = document.getElementById("toggle-weather-btn");
    if (!button) {
        return;
    }
    button.textContent = state.weatherMarkersVisible
        ? "Hide Airport Weather Layer"
        : "Show Airport Weather Layer";
    button.classList.toggle("active", state.weatherMarkersVisible);
}

async function refreshAreaWeatherLayer() {
    if (!state.map) {
        return;
    }

    updateWeatherLayerStatus("Loading airport weather for the current map view...");
    const bounds = state.map.getBounds();
    const response = await fetch(buildAreaWeatherUrl(bounds));
    if (!response.ok) {
        const failure = await response.json().catch(() => ({ error: "Area weather request failed." }));
        updateWeatherLayerStatus(failure.error || "Area weather request failed.");
        return;
    }

    const payload = await response.json();
    const routeAirportIds = new Set(state.airportMarkers.map((entry) => entry.icao));
    const items = Array.isArray(payload.items)
        ? payload.items.filter((item) => !routeAirportIds.has(String(item.icao || "").toUpperCase()))
        : [];

    items.forEach((item) => {
        if (item?.icao && item?.weather) {
            cacheWeather(item.icao, loadFlightDraft()?.date, item.weather);
        }
    });

    renderAreaWeatherMarkers(items);
    const stationCount = items.length;
    const truncationNote = payload.truncated ? ` Showing ${stationCount} of ${payload.totalStationsInBounds} stations.` : "";
    updateWeatherLayerStatus(
        stationCount === 0
            ? "No additional visible airport weather stations were found in the current map view."
            : `Airport weather layer loaded for ${stationCount} nearby station${stationCount === 1 ? "" : "s"}.${truncationNote}`,
    );
}

function buildAreaWeatherUrl(bounds) {
    const draft = loadFlightDraft();
    const params = new URLSearchParams({
        minLat: String(bounds.getSouth()),
        minLon: String(bounds.getWest()),
        maxLat: String(bounds.getNorth()),
        maxLon: String(bounds.getEast()),
    });
    if (draft?.date) {
        const parsed = new Date(draft.date);
        const datetime = Number.isFinite(parsed.getTime()) ? parsed.toISOString() : draft.date;
        params.set("datetime", datetime);
    }
    return `/api/weather/area?${params.toString()}`;
}

function renderAreaWeatherMarkers(items) {
    clearAreaWeatherMarkers();
    if (!state.map) {
        return;
    }

    state.areaWeatherMarkers = items.map((item) => {
        const marker = window.L.marker([Number(item.lat), Number(item.lon)], {
            icon: window.L.divIcon({
                className: "airport-weather-layer-icon",
                html: buildAreaWeatherLayerHtml(item),
                iconSize: [74, 40],
                iconAnchor: [37, 46],
            }),
        }).addTo(state.map);
        marker.bindPopup(buildAreaWeatherPopup(item));
        return { ...item, marker };
    });
}

function clearAreaWeatherMarkers() {
    state.areaWeatherMarkers.forEach((item) => {
        if (item.marker && state.map?.hasLayer(item.marker)) {
            state.map.removeLayer(item.marker);
        }
    });
    state.areaWeatherMarkers = [];
}

function updateAirportWeatherLayer(icao) {
    state.airportMarkers
        .filter((entry) => entry.icao === icao)
        .forEach((entry) => {
            if (!state.weatherMarkersVisible) {
                return;
            }
            ensureAirportWeatherLayer(entry);
        });
}

function ensureAirportWeatherLayer(entry) {
    removeAirportWeatherLayer(entry);
    const weather = state.weatherByIcao.get(entry.icao);
    if (!weather || weather.error || !state.map) {
        return;
    }

    const html = `
        <div class="airport-weather-layer ${weather.forecast?.isForecast ? "forecast" : "observed"}" aria-hidden="true">
            <div class="airport-weather-layer-code">${escapeHtml(entry.icao)}</div>
            <div class="airport-weather-layer-line">${escapeHtml(formatWindShort(weather.windDirection, weather.windSpeed))}</div>
            <div class="airport-weather-layer-line">${escapeHtml(formatTemperatureShort(weather.temperature))}</div>
        </div>
    `;
    entry.weatherLayer = window.L.marker([entry.lat, entry.lon], {
        icon: window.L.divIcon({
            className: "airport-weather-layer-icon",
            html,
            iconSize: [78, 44],
            iconAnchor: [39, 52],
        }),
        interactive: false,
        keyboard: false,
    }).addTo(state.map);
}

function removeAirportWeatherLayer(entry) {
    if (entry.weatherLayer && state.map?.hasLayer(entry.weatherLayer)) {
        state.map.removeLayer(entry.weatherLayer);
    }
    entry.weatherLayer = null;
}

function buildAirportPopup(point) {
    const weather = state.weatherByIcao.get(point.icao);
    const lines = [
        `<strong>${escapeHtml(point.icao)}</strong>`,
        escapeHtml(point.roleLabel || "Route Airport"),
    ];

    if (!weather) {
        lines.push("Loading airport weather...");
        return lines.join("<br>");
    }

    if (weather.error) {
        lines.push(escapeHtml(weather.error));
        return lines.join("<br>");
    }

    lines.push(`Temperature: ${escapeHtml(formatTemperature(weather.temperature))}`);
    lines.push(`Wind: ${escapeHtml(formatWind(weather.windDirection, weather.windSpeed))}`);
    lines.push(`Altimeter: ${escapeHtml(formatAltimeter(weather.altimeter))}`);

    if (weather.forecast?.isForecast) {
        lines.push("Source: FAA TAF forecast");
        const forecastWindow = formatForecastWindow(weather.forecast);
        if (forecastWindow) {
            lines.push(escapeHtml(forecastWindow));
        }
    } else if (weather.weatherSourceIcao) {
        lines.push(`Source: Nearby station ${escapeHtml(weather.weatherSourceIcao)}`);
    } else {
        lines.push("Source: FAA observation");
    }

    return lines.join("<br>");
}

function buildAreaWeatherLayerHtml(item) {
    return `
        <div class="airport-weather-layer area ${item.weather?.forecast?.isForecast ? "forecast" : "observed"}" aria-hidden="true">
            <div class="airport-weather-layer-code">${escapeHtml(item.icao)}</div>
            <div class="airport-weather-layer-line">${escapeHtml(formatWindShort(item.weather?.windDirection, item.weather?.windSpeed))}</div>
            <div class="airport-weather-layer-line">${escapeHtml(formatTemperatureShort(item.weather?.temperature))}</div>
        </div>
    `;
}

function buildAreaWeatherPopup(item) {
    const lines = [
        `<strong>${escapeHtml(item.icao)}</strong>`,
        escapeHtml(item.name || "Airport Weather Station"),
        `Temperature: ${escapeHtml(formatTemperature(item.weather?.temperature))}`,
        `Wind: ${escapeHtml(formatWind(item.weather?.windDirection, item.weather?.windSpeed))}`,
        `Altimeter: ${escapeHtml(formatAltimeter(item.weather?.altimeter))}`,
    ];

    if (item.weather?.forecast?.isForecast) {
        lines.push("Source: FAA TAF forecast");
        lines.push(escapeHtml(formatForecastWindow(item.weather.forecast)));
    } else if (item.weather?.weatherSourceIcao) {
        lines.push(`Source: Nearby station ${escapeHtml(item.weather.weatherSourceIcao)}`);
    } else {
        lines.push("Source: FAA observation");
    }

    return lines.join("<br>");
}

function updateWeatherStatus(message) {
    const statusNode = document.getElementById("map-weather-status");
    if (statusNode) {
        statusNode.textContent = message;
    }
}

function updateWeatherLayerStatus(message) {
    const statusNode = document.getElementById("map-weather-layer-status");
    if (statusNode) {
        statusNode.textContent = message;
    }
}

function formatTemperature(value) {
    return `${Number(value).toFixed(1)} C`;
}

function formatWind(direction, speed) {
    return `${Math.round(Number(direction) || 0)}° @ ${Math.round(Number(speed) || 0)} kt`;
}

function formatAltimeter(value) {
    return `${Number(value).toFixed(2)} inHg`;
}

function formatWindShort(direction, speed) {
    return `${Math.round(Number(direction) || 0)}°/${Math.round(Number(speed) || 0)}kt`;
}

function formatTemperatureShort(value) {
    return `${Math.round(Number(value))} C`;
}

function formatForecastWindow(forecast) {
    if (!forecast?.validFrom || !forecast?.validTo) {
        return "Forecast from FAA TAF data";
    }

    const validFrom = new Date(forecast.validFrom);
    const validTo = new Date(forecast.validTo);
    if (!Number.isFinite(validFrom.getTime()) || !Number.isFinite(validTo.getTime())) {
        return "Forecast from FAA TAF data";
    }

    return `Valid ${validFrom.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} to ${validTo.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
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
                lat: Number.isFinite(Number(checkpoint.lat))
                    ? Number(checkpoint.lat)
                    : fromPoint.lat + ((toPoint.lat - fromPoint.lat) * fraction),
                lon: Number.isFinite(Number(checkpoint.lon))
                    ? Number(checkpoint.lon)
                    : fromPoint.lon + ((toPoint.lon - fromPoint.lon) * fraction),
                type: checkpoint.type || "",
                source: checkpoint.source || "",
                notes: checkpoint.notes || "",
                score: Number.isFinite(Number(checkpoint.score)) ? Number(checkpoint.score) : null,
            };
        });
    });
}

async function toggleReferenceCheckpoints() {
    state.showReferenceCheckpoints = !state.showReferenceCheckpoints;
    updateReferenceCheckpointButton();

    if (state.showReferenceCheckpoints) {
        await refreshReferenceCheckpoints();
    } else {
        clearReferenceCheckpointMarkers();
    }
}

async function refreshReferenceCheckpoints() {
    if (!state.map) {
        return;
    }

    const bounds = state.map.getBounds();
    const response = await fetch(`/api/checkpoints/reference?minLat=${encodeURIComponent(bounds.getSouth())}&minLon=${encodeURIComponent(bounds.getWest())}&maxLat=${encodeURIComponent(bounds.getNorth())}&maxLon=${encodeURIComponent(bounds.getEast())}`);
    if (!response.ok) {
        return;
    }

    const payload = await response.json();
    const selectedNames = new Set(state.checkpointMarkers.map((checkpoint) => checkpoint.name));
    const references = Array.isArray(payload.checkpoints)
        ? payload.checkpoints.filter((checkpoint) => !selectedNames.has(checkpoint.name))
        : [];

    clearReferenceCheckpointMarkers();
    state.referenceCheckpointMarkers = references.map((checkpoint) => {
        const marker = window.L.circleMarker([checkpoint.lat, checkpoint.lon], {
            radius: 5,
            color: "#a78bfa",
            fillColor: "#a78bfa",
            fillOpacity: 0.9,
            weight: 2,
            dashArray: "3 3",
        }).addTo(state.map);

        marker.bindPopup(`<strong>${escapeHtml(checkpoint.name)}</strong><br>${escapeHtml(checkpoint.notes || "Curated nearby visual checkpoint")}`);
        return { ...checkpoint, marker };
    });
}

function clearReferenceCheckpointMarkers() {
    state.referenceCheckpointMarkers.forEach((checkpoint) => {
        if (checkpoint.marker && state.map && state.map.hasLayer(checkpoint.marker)) {
            state.map.removeLayer(checkpoint.marker);
        }
    });
    state.referenceCheckpointMarkers = [];
}

function updateReferenceCheckpointButton() {
    const button = document.getElementById("toggle-reference-checkpoints-btn");
    if (!button) {
        return;
    }

    button.textContent = state.showReferenceCheckpoints
        ? "Hide Nearby Reference Checkpoints"
        : "Show Nearby Reference Checkpoints";
    button.classList.toggle("active", state.showReferenceCheckpoints);
}

async function toggleAirspaceOverlay() {
    state.showAirspace = !state.showAirspace;
    updateAirspaceToggleButton();

    if (!state.showAirspace) {
        clearAirspaceOverlay();
        updateAirspaceStatus("FAA airspace overlay is off.");
        return;
    }

    await refreshAirspaceOverlay();
}

async function refreshAirspaceOverlay() {
    if (!state.map) {
        return;
    }

    const bounds = state.map.getBounds();
    const requestedBounds = {
        minLat: bounds.getSouth(),
        minLon: bounds.getWest(),
        maxLat: bounds.getNorth(),
        maxLon: bounds.getEast(),
    };
    const cacheKey = buildAirspaceCacheKey(bounds);
    const routeCacheKey = buildAirspaceRouteCacheKey(state.routeSignature);
    const cached = loadCachedAirspace(cacheKey, requestedBounds, routeCacheKey);
    if (cached) {
        renderAirspaceOverlay(cached);
        updateAirspaceStatus(`FAA airspace overlay loaded from local cache (${cached.features?.length || 0} feature${cached.features?.length === 1 ? "" : "s"}).`);
        return;
    }

    updateAirspaceStatus("Loading FAA airspace…");

    const response = await fetch(buildAirspaceUrl(bounds));
    if (!response.ok) {
        const failure = await response.json().catch(() => ({ error: "FAA airspace request failed." }));
        updateAirspaceStatus(failure.error || "FAA airspace request failed.");
        return;
    }

    const payload = await response.json();
    cacheAirspace(cacheKey, payload, requestedBounds, routeCacheKey);
    renderAirspaceOverlay(payload);
    updateAirspaceStatus(`FAA airspace overlay loaded for the current view (${payload.features?.length || 0} feature${payload.features?.length === 1 ? "" : "s"}).`);
}

function renderAirspaceOverlay(geojson) {
    clearAirspaceOverlay();

    state.airspaceLayer = window.L.geoJSON(geojson, {
        pane: ensureAirspacePane(),
        style: (feature) => {
            const className = feature?.properties?.class;
            return getAirspaceStyle(className);
        },
        onEachFeature: (feature, layer) => {
            layer.bindPopup(buildAirspacePopup(feature.properties || {}));
        },
    }).addTo(state.map);
}

function clearAirspaceOverlay() {
    if (state.airspaceLayer && state.map?.hasLayer(state.airspaceLayer)) {
        state.map.removeLayer(state.airspaceLayer);
    }
    state.airspaceLayer = null;
}

function ensureAirspacePane() {
    if (!state.map.getPane("airspace")) {
        const pane = state.map.createPane("airspace");
        pane.style.zIndex = "350";
    }
    return "airspace";
}

function buildAirspaceUrl(bounds) {
    const params = new URLSearchParams({
        minLat: String(bounds.getSouth()),
        minLon: String(bounds.getWest()),
        maxLat: String(bounds.getNorth()),
        maxLon: String(bounds.getEast()),
        classes: "B,C,D,E",
    });
    return `/api/airspace?${params.toString()}`;
}

function buildAirspaceCacheKey(bounds) {
    return [
        "B,C,D,E",
        normalizeAirspaceBoundsValue(bounds.getSouth()),
        normalizeAirspaceBoundsValue(bounds.getWest()),
        normalizeAirspaceBoundsValue(bounds.getNorth()),
        normalizeAirspaceBoundsValue(bounds.getEast()),
    ].join("|");
}

function buildAirspaceRouteCacheKey(routeSignature) {
    if (!routeSignature) {
        return "";
    }
    return `route|B,C,D,E|${routeSignature}`;
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
        classes: "B,C,D,E",
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

function buildAirspacePopup(properties) {
    const lines = [
        `<strong>${escapeHtml(properties.name || "Unnamed Airspace")}</strong>`,
        `Class ${escapeHtml(properties.class || "?")}`,
    ];

    if (properties.typeCode) {
        lines.push(`Type: ${escapeHtml(properties.typeCode)}`);
    }
    if (properties.lowerDesc || properties.upperDesc) {
        lines.push(`Altitudes: ${escapeHtml(properties.lowerDesc || "Unknown lower")} to ${escapeHtml(properties.upperDesc || "Unknown upper")}`);
    }
    if (properties.commName) {
        lines.push(`Facility: ${escapeHtml(properties.commName)}`);
    }
    if (properties.icaoId) {
        lines.push(`ICAO: ${escapeHtml(properties.icaoId)}`);
    }
    if (properties.sector) {
        lines.push(`Sector: ${escapeHtml(properties.sector)}`);
    }

    return lines.join("<br>");
}

function getAirspaceStyle(airspaceClass) {
    if (airspaceClass === "B") {
        return {
            color: "#1d4ed8",
            weight: 2.6,
            fillColor: "#2563eb",
            fillOpacity: 0.11,
        };
    }
    if (airspaceClass === "C") {
        return {
            color: "#7c3aed",
            weight: 2.4,
            fillColor: "#8b5cf6",
            fillOpacity: 0.1,
        };
    }
    if (airspaceClass === "D") {
        return {
            color: "#0f766e",
            weight: 2.2,
            fillColor: "#14b8a6",
            fillOpacity: 0.09,
        };
    }
    return {
        color: "#b45309",
        weight: 2,
        fillColor: "#f59e0b",
        fillOpacity: 0.07,
        dashArray: "6 4",
    };
}

function updateAirspaceToggleButton() {
    const button = document.getElementById("toggle-airspace-btn");
    if (!button) {
        return;
    }

    button.textContent = state.showAirspace
        ? "Hide FAA Airspace"
        : "Show FAA Airspace";
    button.classList.toggle("active", state.showAirspace);
}

function updateAirspaceStatus(message) {
    const statusNode = document.getElementById("map-airspace-status");
    if (!statusNode) {
        return;
    }

    statusNode.textContent = message;
}

function toggleMapMaximized() {
    state.mapMaximized = !state.mapMaximized;
    if (state.mapMaximized) {
        state.routePanelCollapsed = true;
    } else {
        state.routePanelCollapsed = false;
    }
    container.classList.toggle("map-maximized", state.mapMaximized);
    document.body.classList.toggle("map-focus-mode", state.mapMaximized);
    const button = document.getElementById("maximize-map-btn");
    if (button) {
        button.textContent = state.mapMaximized ? "Exit Fullscreen" : "Maximize Map";
    }
    updateRoutePanelState();

    window.setTimeout(() => {
        state.map?.invalidateSize();
        if (state.routeBounds) {
            state.map?.fitBounds(state.routeBounds, { padding: [30, 30] });
        }
    }, 100);
}

function toggleRoutePanel() {
    state.routePanelCollapsed = !state.routePanelCollapsed;
    updateRoutePanelState();
    window.setTimeout(() => {
        state.map?.invalidateSize();
        if (state.routeBounds) {
            state.map?.fitBounds(state.routeBounds, { padding: [30, 30] });
        }
    }, 100);
}

function updateRoutePanelState() {
    const routePanel = document.getElementById("route-panel");
    const toggleButton = document.getElementById("toggle-route-panel-btn");
    if (!routePanel || !toggleButton) {
        return;
    }

    const shouldCollapse = state.mapMaximized && state.routePanelCollapsed;
    routePanel.classList.toggle("collapsed", shouldCollapse);
    toggleButton.textContent = shouldCollapse ? "Show Panel" : "Hide Panel";
    toggleButton.classList.toggle("active", !shouldCollapse);
    toggleButton.style.display = state.mapMaximized ? "inline-flex" : "none";
}

async function toggleCurrentLocation() {
    if (state.showCurrentLocation) {
        stopCurrentLocationTracking("Current location is off.");
        return;
    }

    startCurrentLocationTracking();
}

function startCurrentLocationTracking() {
    if (!navigator.geolocation) {
        updateLocationStatus("Current location is unavailable in this browser.", "error");
        return;
    }

    state.showCurrentLocation = true;
    updateLocationToggleButton();
    updateLocationStatus("Waiting for device location...", "info");

    state.locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            updateCurrentLocation(position);
        },
        (error) => {
            const message = error.code === error.PERMISSION_DENIED
                ? "Location permission was denied."
                : error.code === error.POSITION_UNAVAILABLE
                    ? "Current location is unavailable right now."
                    : error.code === error.TIMEOUT
                        ? "Current location request timed out."
                        : "Current location request failed.";
            stopCurrentLocationTracking(message, "error");
        },
        {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 10000,
        },
    );
}

function stopCurrentLocationTracking(message = "Current location is off.", status = "info") {
    if (typeof state.locationWatchId === "number" && navigator.geolocation) {
        navigator.geolocation.clearWatch(state.locationWatchId);
    }
    state.locationWatchId = null;
    state.showCurrentLocation = false;

    if (state.currentLocationMarker && state.map?.hasLayer(state.currentLocationMarker)) {
        state.map.removeLayer(state.currentLocationMarker);
    }
    if (state.currentLocationAccuracyCircle && state.map?.hasLayer(state.currentLocationAccuracyCircle)) {
        state.map.removeLayer(state.currentLocationAccuracyCircle);
    }
    state.currentLocationMarker = null;
    state.currentLocationAccuracyCircle = null;
    updateLocationToggleButton();
    updateLocationStatus(message, status);
}

function updateCurrentLocation(position) {
    if (!state.map) {
        return;
    }

    const lat = Number(position.coords.latitude);
    const lon = Number(position.coords.longitude);
    const accuracyMeters = Number(position.coords.accuracy) || 0;

    if (!state.currentLocationMarker) {
        state.currentLocationMarker = window.L.marker([lat, lon], {
            icon: buildCurrentLocationIcon(),
        }).addTo(state.map);
        state.currentLocationMarker.bindPopup("<strong>Current Location</strong>");
    } else {
        state.currentLocationMarker.setLatLng([lat, lon]);
    }

    if (!state.currentLocationAccuracyCircle) {
        state.currentLocationAccuracyCircle = window.L.circle([lat, lon], {
            radius: accuracyMeters,
            color: "#22c55e",
            fillColor: "#22c55e",
            fillOpacity: 0.12,
            weight: 1,
        }).addTo(state.map);
    } else {
        state.currentLocationAccuracyCircle.setLatLng([lat, lon]);
        state.currentLocationAccuracyCircle.setRadius(accuracyMeters);
    }

    updateLocationStatus(
        `Current location active at ${lat.toFixed(4)}, ${lon.toFixed(4)} (±${Math.round(accuracyMeters)} m).`,
        "active",
    );
}

function buildCurrentLocationIcon() {
    return window.L.divIcon({
        className: "current-location-icon",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12],
        html: `
            <div class="current-location-plane" aria-hidden="true">
                <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="presentation">
                    <path d="M24 4 L29 18 L42 21 L42 27 L29 30 L24 44 L20 44 L21 29 L9 33 L7 30 L15 24 L7 18 L9 15 L21 19 L20 4 Z" fill="#1e3a8a" stroke="#f8fafc" stroke-width="2.2" stroke-linejoin="round"/>
                </svg>
            </div>
        `,
    });
}

function updateLocationToggleButton() {
    const button = document.getElementById("toggle-location-btn");
    if (!button) {
        return;
    }

    button.textContent = state.showCurrentLocation
        ? "Hide Current Location"
        : "Show Current Location";
    button.classList.toggle("active", state.showCurrentLocation);
}

function updateLocationStatus(message, status = "info") {
    const statusNode = document.getElementById("map-location-status");
    if (!statusNode) {
        return;
    }

    statusNode.textContent = message;
    statusNode.className = "map-location-status";
    if (status === "active") {
        statusNode.classList.add("active");
    }
    if (status === "error") {
        statusNode.classList.add("error");
    }
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
        type: chart.type,
        description: `${index === 0 ? "Primary likely sectional" : "Nearby sectional alternative"} for this route. Open the official FAA chart pages for current PDF/GeoTIFF downloads.`,
        url: FAA_SECTIONAL_INFO_URL,
    }));

    if (nearestTac) {
        references.push({
            name: nearestTac.name,
            type: nearestTac.type,
            description: "Likely TAC coverage if you want a larger-scale chart around the metro area.",
            url: FAA_TAC_INFO_URL,
        });
    }

    references.push({
        name: "FAA VFR Raster Charts",
        type: "catalog",
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
    <name>CieloRumbo Route</name>
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

function renderCheckpointMeta(checkpoint) {
    const badges = [];
    const typeClass = checkpoint.type === "visual_checkpoint"
        ? "visual"
        : checkpoint.type === "airport"
            ? "airport"
            : checkpoint.type === "manual"
                ? "manual"
                : "";

    if (checkpoint.type) {
        badges.push(`<span class="checkpoint-badge ${typeClass}">${escapeHtml(formatCheckpointType(checkpoint.type))}</span>`);
    }
    if (checkpoint.source) {
        badges.push(`<span class="checkpoint-badge">${escapeHtml(formatCheckpointSource(checkpoint.source))}</span>`);
    }
    if (typeof checkpoint.score === "number" && Number.isFinite(checkpoint.score)) {
        badges.push(`<span class="checkpoint-badge">Score ${escapeHtml(checkpoint.score.toFixed(1))}</span>`);
    }

    if (badges.length === 0) {
        return "";
    }

    return `<span class="checkpoint-meta">${badges.join("")}</span>`;
}

function buildCheckpointPopup(checkpoint) {
    const details = [
        `<strong>${escapeHtml(checkpoint.name)}</strong>`,
        `${escapeHtml(checkpoint.fromIcao)} to ${escapeHtml(checkpoint.toIcao)}`,
    ];

    if (checkpoint.type) {
        details.push(`Type: ${escapeHtml(formatCheckpointType(checkpoint.type))}`);
    }
    if (checkpoint.source) {
        details.push(`Source: ${escapeHtml(formatCheckpointSource(checkpoint.source))}`);
    }
    if (checkpoint.comms) {
        details.push(`Comms: ${escapeHtml(checkpoint.comms)}`);
    }
    if (checkpoint.notes) {
        details.push(escapeHtml(checkpoint.notes));
    }

    return details.join("<br>");
}

function getCheckpointMarkerStyle(checkpoint) {
    if (checkpoint.type === "visual_checkpoint") {
        return {
            radius: 7,
            color: "#ef4444",
            fillColor: "#ef4444",
        };
    }
    if (checkpoint.type === "airport") {
        return {
            radius: 6,
            color: "#10b981",
            fillColor: "#10b981",
        };
    }
    if (checkpoint.type === "manual") {
        return {
            radius: 6,
            color: "#f59e0b",
            fillColor: "#f59e0b",
        };
    }
    return {
        radius: 6,
        color: "#38bdf8",
        fillColor: "#38bdf8",
    };
}

function formatCheckpointType(type) {
    return String(type || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatCheckpointSource(source) {
    const normalized = String(source || "").replaceAll("_", " ");
    if (normalized === "chart candidate") {
        return "Visual Priority";
    }
    if (normalized === "curated visual checkpoint") {
        return "Curated Visual";
    }
    if (normalized === "airport reference") {
        return "Airport Data";
    }
    return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}

async function ensureSectionalOverlay() {
    if (!state.map) {
        return;
    }

    const primarySectional = findPrimarySectionalReference();
    if (!primarySectional) {
        updateMapStatus("FAA sectional overlay is only available for routes with a nearby sectional chart reference.");
        return;
    }

    if (!window.JSZip || !window.parseGeoraster || !window.GeoRasterLayer) {
        updateMapStatus("FAA sectional overlay libraries are unavailable. Falling back to terrain.");
        return;
    }

    try {
        if (state.sectionalOverlayLayer) {
            state.sectionalOverlayLayer.addTo(state.map);
            updateMapStatus(`FAA sectional overlay loaded: ${primarySectional.name}.`);
            return;
        }

        if (!state.sectionalOverlayPromise) {
            state.sectionalOverlayPromise = loadSectionalOverlay(primarySectional.name);
        }

        const layer = await state.sectionalOverlayPromise;
        state.sectionalOverlayLayer = layer;
        state.sectionalOverlayLayer.addTo(state.map);
        updateMapStatus(`FAA sectional overlay loaded: ${primarySectional.name}.`);
    } catch (error) {
        removeSectionalOverlay();
        state.sectionalOverlayPromise = null;
        updateMapStatus(`FAA sectional overlay unavailable. Using terrain only. ${error.message}`);
    }
}

async function loadSectionalOverlay(chartName) {
    const metadataResponse = await fetch(`/api/charts/sectional?name=${encodeURIComponent(chartName)}`);
    if (!metadataResponse.ok) {
        const failure = await metadataResponse.json().catch(() => ({ error: "FAA sectional metadata request failed." }));
        throw new Error(failure.error || "FAA sectional metadata request failed.");
    }

    const metadata = await metadataResponse.json();
    state.sectionalOverlayMetadata = metadata;

    const zipResponse = await fetch(`/api/charts/sectional/content?name=${encodeURIComponent(chartName)}`);
    if (!zipResponse.ok) {
        throw new Error(`FAA chart ZIP returned ${zipResponse.status}`);
    }

    const zipBuffer = await zipResponse.arrayBuffer();
    const zip = await window.JSZip.loadAsync(zipBuffer);
    const tifEntry = Object.values(zip.files).find((file) => !file.dir && /\.tif$/i.test(file.name));
    if (!tifEntry) {
        throw new Error("FAA chart ZIP did not contain a GeoTIFF file.");
    }

    const tifBuffer = await tifEntry.async("arraybuffer");
    const georaster = await window.parseGeoraster(tifBuffer);
    return new window.GeoRasterLayer({
        georaster,
        opacity: 0.72,
        resolution: 256,
    });
}

function removeSectionalOverlay() {
    if (state.sectionalOverlayLayer && state.map && state.map.hasLayer(state.sectionalOverlayLayer)) {
        state.map.removeLayer(state.sectionalOverlayLayer);
    }
}

function findPrimarySectionalReference() {
    const chartLinks = Array.from(document.querySelectorAll("#chart-reference-list .chart-link-button"));
    const sectionalLink = chartLinks.find((link) => link.textContent.includes("Sectional"));
    if (!sectionalLink) {
        return null;
    }

    return {
        name: sectionalLink.childNodes[0]?.textContent?.trim() || sectionalLink.textContent.trim(),
    };
}
