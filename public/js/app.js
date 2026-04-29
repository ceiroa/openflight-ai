import {
    calculateClimb,
    calculateDensityAltitude,
    calculatePressureAltitude,
    calculateWindTriangle,
} from "./navigation.js";
import {
    clearFlightDraft,
    clearCheckpointPlan,
    checkpointPlanLooksLegacy,
    clearNavLogSnapshot,
    getCheckpointPlanForRoute,
    loadNavLogSnapshot,
    normalizeAirportCode,
    createRouteSignature,
    CHECKPOINT_PLAN_VERSION,
    FLIGHT_PLAN_FILE_VERSION,
    loadFlightDraft,
    saveCheckpointPlan,
    saveFlightDraft,
    saveNavLogSnapshot,
} from "./flightStore.js";

const DEFAULT_AIRCRAFT_NAME = "Evektor Harmony LSA";
const DEFAULT_CHECKPOINT_MODE = "enhanced";

const state = {
    aircraftData: null,
    weatherCache: new Map(),
    airportCommsCache: new Map(),
};

const flightForm = document.getElementById("flight-form");
const addLegButton = document.getElementById("add-leg-btn");
const generateButton = document.getElementById("generate-btn");
const printButton = document.getElementById("print-btn");
const destinationsContainer = document.getElementById("destinations-container");
const statusBanner = document.getElementById("status-banner");
const menuToggleButton = document.getElementById("menu-toggle");
const sideMenu = document.getElementById("side-menu");
const openCheckpointsButton = document.getElementById("open-checkpoints-btn");
const openMapButton = document.getElementById("open-map-btn");
const openAircraftButton = document.getElementById("open-aircraft-btn");
const testFillButton = document.getElementById("test-fill-btn");
const savePlanButton = document.getElementById("save-plan-btn");
const loadPlanButton = document.getElementById("load-plan-btn");
const loadPlanInput = document.getElementById("load-plan-input");
const debugToggleButton = document.getElementById("debug-toggle");
const debugWindow = document.getElementById("debug-window");
const checkpointStatus = document.getElementById("checkpoint-status");
const loadingProgress = document.getElementById("loading-progress");
const loadingProgressLabel = document.getElementById("loading-progress-label");
const loadingProgressBar = document.getElementById("loading-progress-bar");
const loadingProgressNote = document.getElementById("loading-progress-note");
const MIN_PROGRESS_VISIBLE_MS = 700;
let progressTimer = null;
let progressValue = 0;
let progressStartedAt = 0;

document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("date").value = new Date().toISOString().split("T")[0];
    drawGraph();
    registerEventHandlers();
    await loadAircraftOptions();
    await loadAircraft(document.getElementById("aircraft").value || DEFAULT_AIRCRAFT_NAME);
    if (shouldRestoreDraftFromUrl()) {
        restoreFlightDraft();
        clearRestoreDraftFlagFromUrl();
    } else {
        addLeg();
    }
    restoreMatchingNavLog();
    updateGenerateButtonState();
});

function registerEventHandlers() {
    addLegButton.addEventListener("click", addLeg);
    generateButton.addEventListener("click", () => {
        if (generateButton.dataset.mode === "open") {
            openNavLog();
            return;
        }
        if (generateButton.dataset.mode === "close") {
            hideNavLog();
            updateGenerateButtonState();
            return;
        }
        void generateLog();
    });
    printButton.addEventListener("click", () => window.print());
    menuToggleButton.addEventListener("click", toggleMenu);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("keydown", handleDocumentKeydown);
    openCheckpointsButton.addEventListener("click", openCheckpointPlanner);
    openMapButton.addEventListener("click", openRouteMap);
    openAircraftButton.addEventListener("click", openAircraftProfiles);
    testFillButton.addEventListener("click", populateTestRoute);
    savePlanButton.addEventListener("click", savePlanToFile);
    loadPlanButton.addEventListener("click", () => loadPlanInput.click());
    loadPlanInput.addEventListener("change", () => {
        void loadPlanFromFile(loadPlanInput.files?.[0] || null);
    });
    debugToggleButton.addEventListener("click", toggleDebugWindow);

    document.getElementById("aircraft").addEventListener("change", async (event) => {
        invalidateNavLogState();
        await loadAircraft(event.target.value.trim());
    });

    document.getElementById("cruise-alt").addEventListener("input", (event) => {
        const value = event.target.value;
        document.querySelectorAll(".leg-planned-alt").forEach((input) => {
            input.value = value;
        });
    });

    flightForm.addEventListener("focusout", async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
            return;
        }

        if (target.id === "departure-icao") {
            await handleWeather(target, "dep");
            return;
        }

        if (target.classList.contains("destination-icao")) {
            await handleWeather(target, "dest");
        }
    });

    flightForm.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
            return;
        }

        invalidateNavLogState();

        if (target.id === "departure-icao") {
            setWeatherStatus(target, "dep");
            return;
        }

        if (target.classList.contains("destination-icao")) {
            setWeatherStatus(target, "dest");
        }
    });
}

function toggleMenu() {
    setMenuOpenState(!sideMenu.classList.contains("open"));
}

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

function showStatus(message, type = "info") {
    statusBanner.textContent = message;
    statusBanner.className = "";
    statusBanner.classList.add(type);
}

function clearStatus() {
    statusBanner.textContent = "";
    statusBanner.className = "";
}

function updateGenerateButtonState() {
    const hasNavLog = hasMatchingNavLogSnapshot();
    const navLogVisible = isNavLogVisible();

    if (!hasNavLog) {
        generateButton.dataset.mode = "generate";
        generateButton.textContent = "GENERATE NAV LOG";
        return;
    }

    generateButton.dataset.mode = navLogVisible ? "close" : "open";
    generateButton.textContent = navLogVisible ? "CLOSE NAV LOG" : "OPEN NAV LOG";
}

function invalidateNavLogState() {
    if (generateButton.dataset.mode === "open" || loadNavLogSnapshot()) {
        clearNavLogSnapshot();
        hideNavLog();
        updateGenerateButtonState();
    }
}

function isNavLogVisible() {
    return document.getElementById("nav-log-container").style.display === "block";
}

function hideNavLog() {
    document.getElementById("nav-log-container").style.display = "none";
}

function setCheckpointStatus(message = "", type = "") {
    if (!checkpointStatus) {
        return;
    }

    checkpointStatus.textContent = message;
    checkpointStatus.className = "checkpoint-status";
    if (type) {
        checkpointStatus.classList.add(type);
    }
    checkpointStatus.style.display = message ? "block" : "none";
}

function startLoadingProgress(initialMessage, note = "Checkpoint generation may take a few seconds while the route is being reviewed.") {
    stopLoadingProgress(true);

    progressValue = 8;
    progressStartedAt = Date.now();
    loadingProgress.classList.add("active");
    loadingProgressBar.style.width = `${progressValue}%`;
    loadingProgressLabel.textContent = initialMessage;
    loadingProgressNote.textContent = note;

    const phases = [
        { until: 28, label: "Loading route data..." },
        { until: 56, label: "Calculating checkpoints..." },
        { until: 82, label: "Preparing nav log tables..." },
        { until: 92, label: "Finishing up..." },
    ];

    progressTimer = window.setInterval(() => {
        progressValue = Math.min(progressValue + 7, 92);
        loadingProgressBar.style.width = `${progressValue}%`;
        const currentPhase = phases.find((phase) => progressValue <= phase.until) ?? phases[phases.length - 1];
        loadingProgressLabel.textContent = currentPhase.label;
    }, 320);
}

function stopLoadingProgress(immediate = false) {
    if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = null;
    }

    if (!loadingProgress.classList.contains("active")) {
        return Promise.resolve();
    }

    const finish = () => {
        loadingProgressBar.style.width = "100%";
        return new Promise((resolve) => {
            window.setTimeout(() => {
                loadingProgress.classList.remove("active");
                loadingProgressBar.style.width = "0%";
                resolve();
            }, 180);
        });
    };

    if (immediate) {
        return finish();
    }

    const elapsed = Date.now() - progressStartedAt;
    const waitMs = Math.max(0, MIN_PROGRESS_VISIBLE_MS - elapsed);
    return new Promise((resolve) => {
        window.setTimeout(() => {
            finish().then(resolve);
        }, waitMs);
    });
}

function log(message) {
    debugWindow.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${message}</div>`;
    debugWindow.scrollTop = debugWindow.scrollHeight;
}

function toggleDebugWindow() {
    const isOpen = debugWindow.style.display === "block";
    debugWindow.style.display = isOpen ? "none" : "block";
    debugToggleButton.setAttribute("aria-expanded", String(!isOpen));
    debugToggleButton.textContent = isOpen ? "Show Debug Log" : "Hide Debug Log";
}

async function loadAircraft(name) {
    const aircraftName = name || DEFAULT_AIRCRAFT_NAME;
    log(`Loading aircraft profile for ${aircraftName}...`);

    try {
        const response = await fetch(`/api/aircraft?name=${encodeURIComponent(aircraftName)}`);
        if (!response.ok) {
            throw new Error(`Aircraft profile lookup failed with status ${response.status}`);
        }

        const aircraftData = await response.json();
        validateAircraftData(aircraftData);
        state.aircraftData = aircraftData;
        document.getElementById("aircraft").value = aircraftData.aircraft;
        clearStatus();
        log(`Loaded aircraft profile for ${aircraftData.aircraft}.`);
    } catch (error) {
        state.aircraftData = null;
        showStatus(error.message, "error");
        log(`Aircraft profile error: ${error.message}`);
    }
}

async function loadAircraftOptions() {
    try {
        const response = await fetch("/api/aircraft");
        if (!response.ok) {
            return;
        }

        const profiles = await response.json();
        const aircraftSelect = document.getElementById("aircraft");
        const currentValue = aircraftSelect.value || DEFAULT_AIRCRAFT_NAME;
        aircraftSelect.innerHTML = profiles
            .map((profile) => `<option value="${profile.aircraft}">${profile.aircraft}</option>`)
            .join("");

        if (profiles.some((profile) => profile.aircraft === currentValue)) {
            aircraftSelect.value = currentValue;
        } else if (profiles.length > 0) {
            aircraftSelect.value = profiles[0].aircraft;
        }
    } catch {
        // Leave the default option in place if profile discovery fails.
    }
}

function validateAircraftData(aircraftData) {
    const climbProfile = aircraftData?.profiles?.climb;
    const cruiseProfile = aircraftData?.profiles?.cruise65 ?? aircraftData?.profiles?.cruise;

    if (!aircraftData?.aircraft || !climbProfile || !cruiseProfile) {
        throw new Error("Aircraft data is incomplete.");
    }

    if (!Array.isArray(climbProfile.climbTable) || climbProfile.climbTable.length === 0) {
        throw new Error("Aircraft climb table is missing.");
    }
}

function getAircraftProfiles() {
    if (!state.aircraftData) {
        throw new Error("Aircraft profile is not loaded.");
    }

    return {
        climb: state.aircraftData.profiles.climb,
        cruise: state.aircraftData.profiles.cruise65 ?? state.aircraftData.profiles.cruise,
    };
}

function drawGraph() {
    const canvas = document.getElementById("flightGraph");
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#020617");
    gradient.addColorStop(1, "#0f172a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#38bdf8";
    ctx.setLineDash([8, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(100, 140);
    ctx.quadraticCurveTo(width / 2, 20, width - 100, 140);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#f1f5f9";
    ctx.beginPath();
    ctx.arc(100, 140, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width - 100, 140, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "bold 12px Inter";
    ctx.fillStyle = "#fff";
    ctx.fillText("DEP", 90, 160);
    ctx.fillText("DEST", width - 115, 160);

    const planeX = width / 2;
    const planeY = 45;
    ctx.save();
    ctx.translate(planeX, planeY);
    ctx.rotate(-0.05);

    ctx.fillStyle = "#38bdf8";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#38bdf8";

    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-12, -25);
    ctx.lineTo(8, -25);
    ctx.lineTo(15, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-12, 25);
    ctx.lineTo(8, 25);
    ctx.lineTo(15, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-24, -10);
    ctx.lineTo(-20, -10);
    ctx.lineTo(-14, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-24, 10);
    ctx.lineTo(-20, 10);
    ctx.lineTo(-14, 0);
    ctx.fill();
    ctx.fillStyle = "#0ea5e9";
    ctx.beginPath();
    ctx.moveTo(-15, -2);
    ctx.lineTo(-26, -12);
    ctx.lineTo(-24, 0);
    ctx.fill();

    ctx.restore();
}

function addLeg() {
    const leg = document.createElement("div");
    leg.className = "dest-leg destination";
    leg.innerHTML = `
        <div class="leg-header">
            <div class="form-group flex-fill">
                <label>Destination (ICAO)</label>
                <input type="text" class="destination-icao" placeholder="e.g. KSFO" required maxlength="4">
            </div>
            <div class="form-group width-leg-field">
                <label>Apt Alt</label>
                <input type="number" class="leg-elevation" value="0">
            </div>
            <div class="form-group width-leg-field">
                <label>Leg Alt</label>
                <input type="number" class="leg-planned-alt" value="${document.getElementById("cruise-alt").value}" required min="0">
            </div>
            <button type="button" class="btn-remove" aria-label="Remove leg">X</button>
        </div>
        <div class="leg-row">
            <div class="form-group"><label>Temp (C)</label><input type="number" class="leg-temp weather-field"></div>
            <div class="form-group"><label>Altim (inHg)</label><input type="number" step="0.01" class="leg-altim weather-field"></div>
            <div class="form-group"><label>Wind Spd (kt)</label><input type="number" class="leg-wind-speed weather-field"></div>
            <div class="form-group"><label>Wind Dir (deg)</label><input type="number" class="leg-wind-dir weather-field"></div>
        </div>
        <div class="leg-weather-status weather-status" aria-live="polite"></div>
        <input type="hidden" class="leg-lat">
        <input type="hidden" class="leg-lon">
        <input type="hidden" class="leg-var" value="0">
    `;

    leg.querySelector(".btn-remove").addEventListener("click", () => removeLeg(leg));
    destinationsContainer.appendChild(leg);
    updateGenerateButtonState();
}

function removeLeg(leg) {
    if (destinationsContainer.children.length <= 1) {
        showStatus("Keep at least one destination leg.", "error");
        return;
    }

    leg.remove();
    clearStatus();
    invalidateNavLogState();
}

async function handleWeather(input, type) {
    const icao = normalizeAirportCode(input.value);
    if (icao.length !== 4) {
        return;
    }

    input.value = icao;

    const cachedWeather = state.weatherCache.get(icao);
    if (cachedWeather) {
        applyWeatherData(input, type, cachedWeather);
        setWeatherStatus(input, type, `Weather loaded for ${icao}.`, "success");
        return;
    }

    setWeatherStatus(input, type, `Loading weather for ${icao}...`, "loading");

    log(`Fetching weather for ${icao}...`);

    try {
        const response = await fetch(buildWeatherUrl(icao));
        if (!response.ok) {
            const failure = await response.json().catch(() => ({ error: "Weather lookup failed." }));
            throw new Error(failure.error || `Weather lookup failed for ${icao}.`);
        }

        const data = await response.json();
        validateWeatherData(data, icao);
        state.weatherCache.set(icao, data);
        applyWeatherData(input, type, data);
        clearStatus();
        setWeatherStatus(input, type, `Weather loaded for ${icao}.`, "success");
        log(`Success: Data loaded for ${icao}.`);
    } catch (error) {
        clearWeatherData(input, type);
        setWeatherStatus(input, type, error.message, "error");
        log(`Error fetching weather for ${icao}: ${error.message}`);
    }
}

function validateWeatherData(data, icao) {
    const requiredNumericFields = ["temperature", "altimeter", "windSpeed", "elevation", "lat", "lon"];
    const missingField = requiredNumericFields.find((field) => !Number.isFinite(Number(data[field])));

    if (missingField) {
        throw new Error(`Weather data for ${icao} is missing ${missingField}.`);
    }
}

function applyWeatherData(input, type, data) {
    const altimeterInHg = Number(data.altimeter).toFixed(2);

    if (type === "dep") {
        document.getElementById("dep-temp").value = data.temperature;
        document.getElementById("dep-altim").value = altimeterInHg;
        document.getElementById("dep-wind-speed").value = data.windSpeed;
        document.getElementById("dep-wind-dir").value = data.windDirection ?? 0;
        document.getElementById("dep-airport-alt").value = data.elevation;
        document.getElementById("dep-lat").value = data.lat;
        document.getElementById("dep-lon").value = data.lon;
        document.getElementById("dep-var").value = data.variation ?? 0;
        return;
    }

    const container = input.closest(".dest-leg");
    container.querySelector(".leg-temp").value = data.temperature;
    container.querySelector(".leg-altim").value = altimeterInHg;
    container.querySelector(".leg-wind-speed").value = data.windSpeed;
    container.querySelector(".leg-wind-dir").value = data.windDirection ?? 0;
    container.querySelector(".leg-elevation").value = data.elevation;
    container.querySelector(".leg-lat").value = data.lat;
    container.querySelector(".leg-lon").value = data.lon;
    container.querySelector(".leg-var").value = data.variation ?? 0;
}

function clearWeatherData(input, type) {
    if (type === "dep") {
        document.getElementById("dep-lat").value = "";
        document.getElementById("dep-lon").value = "";
        document.getElementById("dep-var").value = "0";
        document.getElementById("dep-temp").value = "";
        document.getElementById("dep-altim").value = "";
        document.getElementById("dep-wind-speed").value = "";
        document.getElementById("dep-wind-dir").value = "";
        document.getElementById("dep-airport-alt").value = "0";
        return;
    }

    const container = input.closest(".dest-leg");
    container.querySelector(".leg-temp").value = "";
    container.querySelector(".leg-altim").value = "";
    container.querySelector(".leg-wind-speed").value = "";
    container.querySelector(".leg-wind-dir").value = "";
    container.querySelector(".leg-elevation").value = "0";
    container.querySelector(".leg-lat").value = "";
    container.querySelector(".leg-lon").value = "";
    container.querySelector(".leg-var").value = "0";
}

function setWeatherStatus(input, type, message = "", status = "") {
    const statusElement = type === "dep"
        ? document.getElementById("dep-weather-status")
        : input.closest(".dest-leg")?.querySelector(".leg-weather-status");

    if (!statusElement) {
        return;
    }

    statusElement.textContent = message;
    statusElement.className = type === "dep" ? "weather-status" : "leg-weather-status weather-status";
    if (status) {
        statusElement.classList.add(status);
    }
    if (!message) {
        statusElement.style.display = "none";
    } else {
        statusElement.style.display = "block";
    }
}

function buildWeatherUrl(icao) {
    return `/api/weather/${icao}`;
}

async function getAirportComms(icao) {
    const normalized = normalizeAirportCode(icao);
    if (state.airportCommsCache.has(normalized)) {
        return state.airportCommsCache.get(normalized);
    }

    try {
        const response = await fetch(`/api/airport/${encodeURIComponent(normalized)}/comms`);
        if (!response.ok) {
            throw new Error(`Airport comms lookup failed for ${normalized}.`);
        }

        const comms = await response.json();
        state.airportCommsCache.set(normalized, comms);
        return comms;
    } catch {
        const fallback = { summary: "N/A" };
        state.airportCommsCache.set(normalized, fallback);
        return fallback;
    }
}

function openCheckpointPlanner() {
    saveCurrentFlightDraft();
    window.location.assign("/checkpoints.html");
}

function openAircraftProfiles() {
    saveCurrentFlightDraft();
    window.location.assign("/aircraft.html");
}

function openRouteMap() {
    saveCurrentFlightDraft();
    window.location.assign("/map.html");
}

function restoreFlightDraft() {
    const draft = loadFlightDraft();
    if (!draft) {
        addLeg();
        return;
    }

    applyFlightDraftToForm(draft, { preserveWeather: true, invalidateNavLog: false });
}

function applyFlightDraftToForm(draft, options = {}) {
    const preserveWeather = options.preserveWeather !== false;
    const shouldInvalidateNavLog = options.invalidateNavLog !== false;

    document.getElementById("aircraft").value = draft.aircraftName || DEFAULT_AIRCRAFT_NAME;
    document.getElementById("date").value = draft.date || document.getElementById("date").value;
    document.getElementById("cruise-alt").value = draft.legs?.[0]?.plannedAlt || "3000";
    document.getElementById("departure-icao").value = draft.departure?.icao || "";
    document.getElementById("dep-airport-alt").value = draft.departure?.airportAlt ?? 0;
    document.getElementById("dep-temp").value = preserveWeather ? isFiniteValue(draft.departure?.temp) : "";
    document.getElementById("dep-altim").value = preserveWeather ? isFiniteValue(draft.departure?.altimeter) : "";
    document.getElementById("dep-wind-speed").value = preserveWeather ? isFiniteValue(draft.departure?.windSpeed) : "";
    document.getElementById("dep-wind-dir").value = preserveWeather ? isFiniteValue(draft.departure?.windDirection) : "";
    document.getElementById("dep-lat").value = isFiniteValue(draft.departure?.lat);
    document.getElementById("dep-lon").value = isFiniteValue(draft.departure?.lon);
    document.getElementById("dep-var").value = preserveWeather ? isFiniteValue(draft.departure?.variation, "0") : "0";
    setWeatherStatus(document.getElementById("departure-icao"), "dep");

    destinationsContainer.innerHTML = "";
    const legs = Array.isArray(draft.legs) && draft.legs.length > 0 ? draft.legs : [{}];
    for (const leg of legs) {
        addLeg();
        const container = destinationsContainer.lastElementChild;
        container.querySelector(".destination-icao").value = leg.icao || "";
        container.querySelector(".leg-planned-alt").value = isFiniteValue(leg.plannedAlt, document.getElementById("cruise-alt").value);
        container.querySelector(".leg-temp").value = preserveWeather ? isFiniteValue(leg.temp) : "";
        container.querySelector(".leg-altim").value = preserveWeather ? isFiniteValue(leg.altimeter) : "";
        container.querySelector(".leg-wind-speed").value = preserveWeather ? isFiniteValue(leg.windSpeed) : "";
        container.querySelector(".leg-wind-dir").value = preserveWeather ? isFiniteValue(leg.windDirection) : "";
        container.querySelector(".leg-elevation").value = isFiniteValue(leg.airportElevation, "0");
        container.querySelector(".leg-lat").value = isFiniteValue(leg.lat);
        container.querySelector(".leg-lon").value = isFiniteValue(leg.lon);
        container.querySelector(".leg-var").value = preserveWeather ? isFiniteValue(leg.variation, "0") : "0";
        setWeatherStatus(container.querySelector(".destination-icao"), "dest");
    }

    if (shouldInvalidateNavLog) {
        invalidateNavLogState();
    }
}

async function populateTestRoute() {
    destinationsContainer.innerHTML = "";
    state.weatherCache.clear();

    document.getElementById("departure-icao").value = "KLOT";
    document.getElementById("cruise-alt").value = "3000";

    for (const icao of ["KARR", "KSQI", "KLOT"]) {
        addLeg();
        destinationsContainer.lastElementChild.querySelector(".destination-icao").value = icao;
    }

    await handleWeather(document.getElementById("departure-icao"), "dep");
    for (const input of document.querySelectorAll(".destination-icao")) {
        await handleWeather(input, "dest");
    }
}

function getDistance(lat1, lon1, lat2, lon2) {
    const radiusNm = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radiusNm * c;
}

function getBearing(lat1, lon1, lat2, lon2) {
    const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function collectFlightInputs() {
    const departure = {
        icao: normalizeAirportCode(document.getElementById("departure-icao").value),
        airportAlt: Number(document.getElementById("dep-airport-alt").value),
        temp: Number(document.getElementById("dep-temp").value),
        altimeter: Number(document.getElementById("dep-altim").value),
        windSpeed: Number(document.getElementById("dep-wind-speed").value),
        windDirection: Number(document.getElementById("dep-wind-dir").value),
        lat: Number(document.getElementById("dep-lat").value),
        lon: Number(document.getElementById("dep-lon").value),
        variation: Number(document.getElementById("dep-var").value || 0),
    };

    const legs = Array.from(document.querySelectorAll(".dest-leg.destination")).map((leg) => ({
        icao: normalizeAirportCode(leg.querySelector(".destination-icao").value),
        plannedAlt: Number(leg.querySelector(".leg-planned-alt").value),
        temp: Number(leg.querySelector(".leg-temp").value),
        altimeter: Number(leg.querySelector(".leg-altim").value),
        airportElevation: Number(leg.querySelector(".leg-elevation").value),
        lat: Number(leg.querySelector(".leg-lat").value),
        lon: Number(leg.querySelector(".leg-lon").value),
        windDirection: Number(leg.querySelector(".leg-wind-dir").value),
        windSpeed: Number(leg.querySelector(".leg-wind-speed").value),
        variation: Number(leg.querySelector(".leg-var").value || 0),
    }));

    return {
        aircraftName: document.getElementById("aircraft").value.trim(),
        date: document.getElementById("date").value,
        departure,
        legs,
    };
}

function validateFlightInputs(inputs) {
    const errors = [];

    if (!state.aircraftData) {
        errors.push("Aircraft profile is not loaded.");
    }

    if (inputs.departure.icao.length !== 4) {
        errors.push("Departure ICAO must be 4 characters.");
    }

    if (!Number.isFinite(inputs.departure.lat) || !Number.isFinite(inputs.departure.lon)) {
        errors.push("Departure weather and coordinates must be loaded before generating the nav log.");
    }

    inputs.legs.forEach((leg, index) => {
        const legNumber = index + 1;
        if (leg.icao.length !== 4) {
            errors.push(`Leg ${legNumber} destination ICAO must be 4 characters.`);
        }
        if (!Number.isFinite(leg.lat) || !Number.isFinite(leg.lon)) {
            errors.push(`Leg ${legNumber} weather and coordinates must be loaded before generating the nav log.`);
        }
        if (!Number.isFinite(leg.plannedAlt) || leg.plannedAlt < 0) {
            errors.push(`Leg ${legNumber} planned altitude is invalid.`);
        }
    });

    return errors;
}

function appendRow(tableBody, cells) {
    tableBody.innerHTML += `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
}

function saveCurrentFlightDraft() {
    saveFlightDraft(collectFlightInputs());
}

function buildFlightPlanExport(inputs) {
    const checkpointPlan = getCheckpointPlanForRoute(inputs);

    return {
        app: "openflight-ai",
        version: FLIGHT_PLAN_FILE_VERSION,
        savedAt: new Date().toISOString(),
        flightDraft: {
            aircraftName: inputs.aircraftName,
            date: inputs.date,
            departure: {
                icao: inputs.departure.icao,
                airportAlt: inputs.departure.airportAlt,
                lat: inputs.departure.lat,
                lon: inputs.departure.lon,
            },
            legs: inputs.legs.map((leg) => ({
                icao: leg.icao,
                plannedAlt: leg.plannedAlt,
                airportElevation: leg.airportElevation,
                lat: leg.lat,
                lon: leg.lon,
            })),
        },
        checkpointPlan: checkpointPlan ? {
            version: checkpointPlan.version,
            routeSignature: checkpointPlan.routeSignature,
            savedAt: checkpointPlan.savedAt,
            legs: checkpointPlan.legs,
        } : null,
    };
}

function savePlanToFile() {
    try {
        const inputs = collectFlightInputs();
        const payload = JSON.stringify(buildFlightPlanExport(inputs), null, 2);
        const blob = new Blob([payload], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const depCode = normalizeAirportCode(inputs.departure.icao || "flight");
        const timestamp = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `openflight-plan-${depCode}-${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showStatus("Flight plan saved to file.", "info");
        log("Flight plan saved to file.");
    } catch (error) {
        showStatus(`Plan export failed: ${error.message}`, "error");
        log(`Plan export failed: ${error.message}`);
    }
}

async function loadPlanFromFile(file) {
    if (!file) {
        return;
    }

    try {
        const payload = JSON.parse(await file.text());
        const normalizedPlan = normalizeFlightPlanFile(payload);
        state.weatherCache.clear();
        clearNavLogSnapshot();
        clearFlightDraft();
        if (normalizedPlan.checkpointPlan) {
            saveCheckpointPlan(normalizedPlan.checkpointPlan);
        } else {
            clearCheckpointPlan();
        }
        saveFlightDraft(normalizedPlan.flightDraft);
        applyFlightDraftToForm(normalizedPlan.flightDraft, { preserveWeather: false });
        updateGenerateButtonState();
        showStatus("Loading live weather for imported plan...", "info");
        setCheckpointStatus("");
        await refreshImportedPlanWeather();
        showStatus("Flight plan loaded. Weather was refreshed live.", "info");
        log("Flight plan imported successfully.");
    } catch (error) {
        showStatus(`Plan import failed: ${error.message}`, "error");
        log(`Plan import failed: ${error.message}`);
    } finally {
        loadPlanInput.value = "";
    }
}

function normalizeFlightPlanFile(payload) {
    if (payload?.app !== "openflight-ai") {
        throw new Error("This file is not an OpenFlight AI plan.");
    }

    if (payload.version !== FLIGHT_PLAN_FILE_VERSION) {
        throw new Error(`Unsupported plan version: ${payload.version}.`);
    }

    const draft = payload.flightDraft;
    if (!draft?.departure || !Array.isArray(draft.legs) || draft.legs.length === 0) {
        throw new Error("Flight plan is missing route data.");
    }

    const normalizedDraft = {
        aircraftName: draft.aircraftName || DEFAULT_AIRCRAFT_NAME,
        date: draft.date || new Date().toISOString().split("T")[0],
        departure: {
            icao: normalizeAirportCode(draft.departure.icao || ""),
            airportAlt: Number(draft.departure.airportAlt) || 0,
            lat: Number(draft.departure.lat),
            lon: Number(draft.departure.lon),
            temp: null,
            altimeter: null,
            windSpeed: null,
            windDirection: null,
            variation: null,
        },
        legs: draft.legs.map((leg) => ({
            icao: normalizeAirportCode(leg.icao || ""),
            plannedAlt: Number(leg.plannedAlt) || 0,
            airportElevation: Number(leg.airportElevation) || 0,
            lat: Number(leg.lat),
            lon: Number(leg.lon),
            temp: null,
            altimeter: null,
            windSpeed: null,
            windDirection: null,
            variation: null,
        })),
    };

    if (normalizedDraft.departure.icao.length !== 4 || normalizedDraft.legs.some((leg) => leg.icao.length !== 4)) {
        throw new Error("Flight plan contains invalid airport codes.");
    }

    const routeSignature = createRouteSignature(normalizedDraft);
    const checkpointPlan = payload.checkpointPlan && !checkpointPlanLooksLegacy(payload.checkpointPlan)
        ? normalizeImportedCheckpointPlan({
            ...payload.checkpointPlan,
            routeSignature,
            savedAt: payload.checkpointPlan.savedAt || new Date().toISOString(),
        }, normalizedDraft)
        : null;

    return {
        flightDraft: normalizedDraft,
        checkpointPlan,
    };
}

function normalizeImportedCheckpointPlan(plan, draft) {
    return {
        ...plan,
        legs: (Array.isArray(plan.legs) ? plan.legs : []).map((leg, index) => {
            const fromPoint = index === 0 ? draft.departure : draft.legs[index - 1];
            const toPoint = draft.legs[index];
            const legDistanceNm = Number(leg.legDistanceNm) || getDistance(fromPoint.lat, fromPoint.lon, toPoint.lat, toPoint.lon);
            const checkpointCount = Array.isArray(leg.checkpoints) ? leg.checkpoints.length : 0;
            const suggestedSpacing = checkpointCount > 0 ? legDistanceNm / (checkpointCount + 1) : Math.min(10, Math.max(5, legDistanceNm));

            return {
                legIndex: index,
                fromIcao: leg.fromIcao || fromPoint.icao,
                toIcao: leg.toIcao || toPoint.icao,
                legDistanceNm,
                spacingNm: Number(leg.spacingNm) || suggestedSpacing,
                checkpoints: Array.isArray(leg.checkpoints) ? leg.checkpoints : [],
            };
        }),
    };
}

async function refreshImportedPlanWeather() {
    await handleWeather(document.getElementById("departure-icao"), "dep");
    for (const input of document.querySelectorAll(".destination-icao")) {
        await handleWeather(input, "dest");
    }
    saveCurrentFlightDraft();
}

function hasMatchingNavLogSnapshot() {
    const snapshot = loadNavLogSnapshot();
    if (!snapshot) {
        return false;
    }

    try {
        return snapshot.routeSignature === createRouteSignature(collectFlightInputs());
    } catch {
        return false;
    }
}

function saveCurrentNavLogSnapshot(inputs) {
    saveNavLogSnapshot({
        routeSignature: createRouteSignature(inputs),
        aircraftText: document.getElementById("out-aircraft").innerText,
        dateText: document.getElementById("out-date").innerText,
        table1Html: document.getElementById("table1-body").innerHTML,
        table2Html: document.getElementById("table2-body").innerHTML,
        table3Html: document.getElementById("table3-body").innerHTML,
    });
}

function restoreMatchingNavLog() {
    const snapshot = loadNavLogSnapshot();
    if (!snapshot) {
        return false;
    }

    let currentRouteSignature;
    try {
        currentRouteSignature = createRouteSignature(collectFlightInputs());
    } catch {
        return false;
    }

    if (snapshot.routeSignature !== currentRouteSignature) {
        return false;
    }

    document.getElementById("out-aircraft").innerText = snapshot.aircraftText || "";
    document.getElementById("out-date").innerText = snapshot.dateText || "";
    document.getElementById("table1-body").innerHTML = snapshot.table1Html || "";
    document.getElementById("table2-body").innerHTML = snapshot.table2Html || "";
    document.getElementById("table3-body").innerHTML = snapshot.table3Html || "";
    document.getElementById("nav-log-container").style.display = "block";
    return true;
}

function openNavLog() {
    if (!restoreMatchingNavLog()) {
        updateGenerateButtonState();
        void generateLog();
        return;
    }

    document.getElementById("nav-log-container").style.display = "block";
    updateGenerateButtonState();
    window.scrollTo(0, document.body.scrollHeight);
}

async function getApprovedCheckpoints(inputs) {
    const savedPlan = getCheckpointPlanForRoute(inputs);
    if (savedPlan) {
        return {
            legs: savedPlan.legs,
            source: "cache",
        };
    }

    log("Loading checkpoints...");
    showStatus("Loading checkpoints...", "info");
    setCheckpointStatus("");
    startLoadingProgress("Loading checkpoints...");

    try {
        const response = await fetch(`/api/checkpoints/generate?mode=${encodeURIComponent(DEFAULT_CHECKPOINT_MODE)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(inputs),
        });

        if (!response.ok) {
            const failure = await response.json().catch(() => ({ error: "Checkpoint generation failed." }));
            throw new Error(failure.error || "Checkpoint generation failed.");
        }

        const plan = await response.json();
        const normalizedPlan = {
            version: CHECKPOINT_PLAN_VERSION,
            routeSignature: createRouteSignature(inputs),
            mode: DEFAULT_CHECKPOINT_MODE,
            legs: Array.isArray(plan.legs) ? plan.legs : [],
        };

        if (!checkpointPlanLooksLegacy(normalizedPlan)) {
            saveCheckpointPlan(normalizedPlan);
        }

        return {
            legs: normalizedPlan.legs,
            source: "generated",
        };
    } catch (error) {
        log(`Checkpoint generation error: ${error.message}`);
        showStatus(error.message, "error");
        setCheckpointStatus(error.message, "error");
        return {
            legs: null,
            source: "error",
        };
    } finally {
        await stopLoadingProgress();
    }
}

async function generateLog() {
    log("Generating Log...");

    let profiles;
    try {
        profiles = getAircraftProfiles();
    } catch (error) {
        setCheckpointStatus("");
        showStatus(error.message, "error");
        log(`Validation failed: ${error.message}`);
        return;
    }

    const inputs = collectFlightInputs();
    const errors = validateFlightInputs(inputs);
    if (errors.length > 0) {
        setCheckpointStatus("");
        showStatus(errors[0], "error");
        log(`Validation failed: ${errors.join(" | ")}`);
        return;
    }

    showStatus("Loading airport comms...", "info");
    setCheckpointStatus("");

    document.getElementById("out-aircraft").innerText = `Aircraft: ${inputs.aircraftName}`;
    document.getElementById("out-date").innerText = `Date: ${inputs.date}`;

    const table1Body = document.getElementById("table1-body");
    const table2Body = document.getElementById("table2-body");
    const table3Body = document.getElementById("table3-body");
    table1Body.innerHTML = "";
    table2Body.innerHTML = "";
    table3Body.innerHTML = "";
    saveFlightDraft(inputs);

    const departurePressureAlt = calculatePressureAltitude(inputs.departure.airportAlt, inputs.departure.altimeter);
    const departureDensityAlt = calculateDensityAltitude(departurePressureAlt, inputs.departure.temp);
    appendRow(table1Body, [
        `${inputs.departure.icao} (APT)`,
        inputs.departure.airportAlt,
        departurePressureAlt,
        inputs.departure.temp,
        departureDensityAlt,
        "100%",
        profiles.climb.rpm,
        profiles.climb.speed_kts,
        profiles.climb.fuel_burn_gph,
    ]);

    let totalDistanceRemaining = 0;
    let prevLat = inputs.departure.lat;
    let prevLon = inputs.departure.lon;
    for (const leg of inputs.legs) {
        totalDistanceRemaining += getDistance(prevLat, prevLon, leg.lat, leg.lon);
        prevLat = leg.lat;
        prevLon = leg.lon;
    }

    prevLat = inputs.departure.lat;
    prevLon = inputs.departure.lon;
    let previousIcao = inputs.departure.icao;
    let previousAltitude = inputs.departure.airportAlt;
    let previousSurfaceWindDirection = inputs.departure.windDirection;
    let previousSurfaceWindSpeed = inputs.departure.windSpeed;
    let previousVariation = inputs.departure.variation;
    const [checkpointResult, airportCommsEntries] = await Promise.all([
        getApprovedCheckpoints(inputs),
        Promise.all([
            getAirportComms(inputs.departure.icao),
            ...inputs.legs.map((leg) => getAirportComms(leg.icao)),
        ]),
    ]);
    const approvedCheckpoints = checkpointResult.legs;
    const airportCommsByCode = new Map([
        [inputs.departure.icao, airportCommsEntries[0]],
        ...inputs.legs.map((leg, index) => [leg.icao, airportCommsEntries[index + 1]]),
    ]);

    inputs.legs.forEach((leg, index) => {
        const legDistance = getDistance(prevLat, prevLon, leg.lat, leg.lon);
        const trueCourse = getBearing(prevLat, prevLon, leg.lat, leg.lon);

        if (index > 0) {
            const aptPressureAlt = calculatePressureAltitude(previousAltitude, leg.altimeter);
            const aptDensityAlt = calculateDensityAltitude(aptPressureAlt, leg.temp);
            appendRow(table1Body, [
                `${previousIcao} (APT)`,
                previousAltitude,
                aptPressureAlt,
                leg.temp,
                aptDensityAlt,
                "100%",
                profiles.climb.rpm,
                profiles.climb.speed_kts,
                profiles.climb.fuel_burn_gph,
            ]);
        }

        const cruisePressureAlt = calculatePressureAltitude(leg.plannedAlt, leg.altimeter);
        const cruiseDensityAlt = calculateDensityAltitude(cruisePressureAlt, leg.temp);
        appendRow(table1Body, [
            `CRUISE TO ${leg.icao}`,
            leg.plannedAlt,
            cruisePressureAlt,
            leg.temp,
            cruiseDensityAlt,
            "65%",
            profiles.cruise.rpm,
            profiles.cruise.speed_kts,
            profiles.cruise.fuel_burn_gph,
        ]);

        const climbDelta = Math.max(0, leg.plannedAlt - previousAltitude);
        let climbTimeMinutes = 0;
        let climbDistanceNm = 0;

        if (climbDelta > 0) {
            const climbPerformance = calculateClimb(
                leg.plannedAlt,
                previousAltitude,
                leg.temp,
                leg.altimeter,
                profiles.climb.climbTable,
            );
            const climbWind = calculateWindTriangle(trueCourse, profiles.climb.speed_kts, previousSurfaceWindDirection, previousSurfaceWindSpeed);
            climbTimeMinutes = climbPerformance.timeMinutes;
            climbDistanceNm = (climbTimeMinutes / 60) * climbWind.groundspeed;

            const climbTrueHeading = (trueCourse + climbWind.windCorrectionAngle + 360) % 360;
            const climbMagHeading = (climbTrueHeading - previousVariation + 360) % 360;

            appendRow(table2Body, [
                `${previousIcao}-TOC`,
                trueCourse.toFixed(0),
                `${previousSurfaceWindDirection}/${previousSurfaceWindSpeed} (SFC)`,
                climbTrueHeading.toFixed(0),
                previousVariation,
                climbMagHeading.toFixed(0),
                climbWind.groundspeed.toFixed(0),
                climbDistanceNm.toFixed(1),
                climbTimeMinutes.toFixed(1),
                ((climbTimeMinutes / 60) * profiles.climb.fuel_burn_gph).toFixed(1),
            ]);
        }

        const cruiseDistance = Math.max(0, legDistance - climbDistanceNm);
        const cruiseWind = calculateWindTriangle(trueCourse, profiles.cruise.speed_kts, leg.windDirection, leg.windSpeed);
        const cruiseTimeMinutes = cruiseDistance === 0 ? 0 : (cruiseDistance / cruiseWind.groundspeed) * 60;
        const cruiseTrueHeading = (trueCourse + cruiseWind.windCorrectionAngle + 360) % 360;
        const cruiseMagHeading = (cruiseTrueHeading - leg.variation + 360) % 360;

        appendRow(table2Body, [
            `TOC-${leg.icao}`,
            trueCourse.toFixed(0),
            `${leg.windDirection}/${leg.windSpeed} (ALT)`,
            cruiseTrueHeading.toFixed(0),
            leg.variation,
            cruiseMagHeading.toFixed(0),
            cruiseWind.groundspeed.toFixed(0),
            cruiseDistance.toFixed(1),
            cruiseTimeMinutes.toFixed(1),
            ((cruiseTimeMinutes / 60) * profiles.cruise.fuel_burn_gph).toFixed(1),
        ]);

        const legCheckpoints = Array.isArray(approvedCheckpoints?.[index]?.checkpoints)
            ? approvedCheckpoints[index].checkpoints
            : [];

        if (legCheckpoints.length === 0) {
            appendRow(table3Body, [
                leg.icao,
                cruiseMagHeading.toFixed(0),
                legDistance.toFixed(1),
                Math.max(0, totalDistanceRemaining - legDistance).toFixed(1),
                cruiseWind.groundspeed.toFixed(0),
                (climbTimeMinutes + cruiseTimeMinutes).toFixed(0),
                "-",
                airportCommsByCode.get(leg.icao)?.summary || "N/A",
            ]);
        } else {
            let previousCheckpointDistance = 0;
            for (const checkpoint of legCheckpoints) {
                const cumulativeDistance = Math.min(legDistance, Math.max(previousCheckpointDistance, Number(checkpoint.distanceFromLegStartNm) || 0));
                const segmentDistance = cumulativeDistance - previousCheckpointDistance;
                const segmentMinutes = cruiseWind.groundspeed === 0 ? 0 : (segmentDistance / cruiseWind.groundspeed) * 60;

                appendRow(table3Body, [
                    checkpoint.name || "CHECKPOINT",
                    cruiseMagHeading.toFixed(0),
                    segmentDistance.toFixed(1),
                    Math.max(0, totalDistanceRemaining - cumulativeDistance).toFixed(1),
                    cruiseWind.groundspeed.toFixed(0),
                    segmentMinutes.toFixed(0),
                    "-",
                    checkpoint.comms || "VIS",
                ]);

                previousCheckpointDistance = cumulativeDistance;
            }

            const finalSegmentDistance = Math.max(0, legDistance - previousCheckpointDistance);
            const finalMinutes = cruiseWind.groundspeed === 0 ? 0 : (finalSegmentDistance / cruiseWind.groundspeed) * 60;
            appendRow(table3Body, [
                leg.icao,
                cruiseMagHeading.toFixed(0),
                finalSegmentDistance.toFixed(1),
                Math.max(0, totalDistanceRemaining - legDistance).toFixed(1),
                cruiseWind.groundspeed.toFixed(0),
                finalMinutes.toFixed(0),
                "-",
                airportCommsByCode.get(leg.icao)?.summary || "N/A",
            ]);
        }

        totalDistanceRemaining -= legDistance;
        prevLat = leg.lat;
        prevLon = leg.lon;
        previousIcao = leg.icao;
        previousAltitude = leg.airportElevation;
        previousSurfaceWindDirection = leg.windDirection;
        previousSurfaceWindSpeed = leg.windSpeed;
        previousVariation = leg.variation;
    });

    document.getElementById("nav-log-container").style.display = "block";
    saveCurrentNavLogSnapshot(inputs);
    updateGenerateButtonState();
    if (checkpointResult.source === "error") {
        showStatus("Checkpoint generation failed. Destination rows were used instead.", "error");
    } else {
        clearStatus();
        setCheckpointStatus("");
    }
    window.scrollTo(0, document.body.scrollHeight);
}

function isFiniteValue(value, fallback = "") {
    return Number.isFinite(Number(value)) ? String(value) : fallback;
}

function shouldRestoreDraftFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("restoreDraft") === "1";
}

function clearRestoreDraftFlagFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("restoreDraft");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}
