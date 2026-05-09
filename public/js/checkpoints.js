import {
    CHECKPOINT_PLAN_VERSION,
    checkpointPlansEqual,
    clearNavLogSnapshot,
    loadFlightDraft,
    loadCheckpointPlan,
    saveCheckpointPlan,
    getCheckpointPlanForRoute,
    clearCheckpointPlan,
    createRouteSignature,
} from "./flightStore.js";

const plannerRoot = document.getElementById("planner-root");
const statusBanner = document.getElementById("status-banner");
const loadingProgress = document.getElementById("loading-progress");
const loadingProgressLabel = document.getElementById("loading-progress-label");
const loadingProgressBar = document.getElementById("loading-progress-bar");
const loadingProgressNote = document.getElementById("loading-progress-note");
const regenerateButton = document.getElementById("regenerate-btn");
const saveButton = document.getElementById("save-btn");
const openMapButton = document.getElementById("open-map-btn");
const clearButton = document.getElementById("clear-btn");
const checkpointTypeFilter = document.getElementById("checkpoint-type-filter");
const checkpointSourceFilter = document.getElementById("checkpoint-source-filter");
const plannerControls = document.getElementById("planner-controls");
const menuToggleButton = document.getElementById("menu-toggle");
const sideMenu = document.getElementById("side-menu");
const menuMapLink = document.getElementById("menu-map-link");
const menuFlightSetupLink = document.getElementById("menu-flight-setup-link");
const menuNavLinks = Array.from(document.querySelectorAll(".menu-nav-link"));

let currentDraft = null;
let currentPlan = null;
let plannerMode = "enhanced";
let activeTypeFilter = "all";
let activeSourceFilter = "all";
const MIN_PROGRESS_VISIBLE_MS = 1200;
let progressTimer = null;
let progressValue = 0;
let progressStartedAt = 0;
let plannerBusy = false;
const DEFAULT_CHECKPOINT_NOTE = "Visual checkpoint";

document.addEventListener("DOMContentLoaded", () => {
    menuToggleButton.addEventListener("click", () => {
        setMenuOpenState(!sideMenu.classList.contains("open"));
    });
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("keydown", handleDocumentKeydown);

    currentDraft = loadFlightDraft();
    if (!isUsableDraft(currentDraft)) {
        renderSetupRequiredState(
            "Enter a departure and at least one destination in Flight Setup before opening the checkpoints planner.",
        );
        return;
    }

    initializePlanner();

    regenerateButton.addEventListener("click", () => {
        regeneratePlan();
    });
    checkpointTypeFilter.addEventListener("change", () => {
        activeTypeFilter = checkpointTypeFilter.value;
        renderPlanner();
    });
    checkpointSourceFilter.addEventListener("change", () => {
        activeSourceFilter = checkpointSourceFilter.value;
        renderPlanner();
    });
    saveButton.addEventListener("click", savePlan);
    openMapButton.addEventListener("click", openCurrentRouteOnMap);
    clearButton.addEventListener("click", clearPlan);
    menuMapLink?.addEventListener("click", (event) => {
        event.preventDefault();
        if (plannerBusy) {
            showStatus("Checkpoint regeneration is still in progress. Wait for the loading bar to finish.", "info");
            return;
        }
        openCurrentRouteOnMap();
    });
    menuFlightSetupLink?.addEventListener("click", (event) => {
        event.preventDefault();
        if (plannerBusy) {
            showStatus("Checkpoint regeneration is still in progress. Wait for the loading bar to finish.", "info");
            return;
        }
        persistPlannerPlan();
        window.location.assign("/index.html?restoreDraft=1");
    });
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

async function initializePlanner() {
    try {
        await hydratePlan();
        renderPlanner();
    } catch (error) {
        showStatus(error.message, "error");
    } finally {
        setPlannerBusy(false);
    }
}

async function hydratePlan() {
    const savedPlan = getCheckpointPlanForRoute(currentDraft);
    if (savedPlan) {
        currentPlan = savedPlan;
        plannerMode = savedPlan.mode === "classic" ? "enhanced" : (savedPlan.mode || "enhanced");
        return;
    }

    currentPlan = await fetchGeneratedCheckpointPlan();
    plannerMode = currentPlan.mode || plannerMode;
}

function renderPlanner() {
    plannerRoot.innerHTML = "";

    currentPlan.legs.forEach((legPlan, index) => {
        const legCard = document.createElement("section");
        legCard.className = "leg-card";
        const distanceDetailsByIndex = legPlan.checkpoints.map((checkpoint, checkpointIndex) => {
            const fromStartNm = Number(checkpoint.distanceFromLegStartNm) || 0;
            const previousDistance = checkpointIndex > 0
                ? Number(legPlan.checkpoints[checkpointIndex - 1].distanceFromLegStartNm) || 0
                : 0;
            return {
                fromStartNm,
                fromPreviousNm: Math.max(0, fromStartNm - previousDistance),
            };
        });
        const visibleCheckpoints = legPlan.checkpoints
            .map((checkpoint, checkpointIndex) => ({ checkpoint, checkpointIndex }))
            .filter(({ checkpoint }) => matchesCheckpointFilters(checkpoint));

        const checkpointsHtml = legPlan.checkpoints.length === 0
            ? `<div class="empty-state">This leg is short enough that no intermediate checkpoints were generated.</div>`
            : visibleCheckpoints.length === 0
                ? `<div class="empty-state">No checkpoints match the current filters for this leg.</div>`
            : `
                <table class="planner-table">
                    <thead>
                        <tr>
                            <th>Checkpoint Name</th>
                            <th>Distance</th>
                            <th>Comms / Notes</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${visibleCheckpoints.map(({ checkpoint, checkpointIndex }) => `
                            <tr data-checkpoint-row="${index}:${checkpointIndex}">
                                <td data-label="Checkpoint Name">
                                    <div class="checkpoint-name-cell">
                                        <input type="text" value="${escapeHtml(checkpoint.name)}" data-field="name">
                                        ${renderCheckpointMeta(checkpoint)}
                                    </div>
                                </td>
                                <td data-label="Distance">
                                    <div class="checkpoint-distance-cell">
                                        <div class="checkpoint-distance-primary">${escapeHtml(formatDistanceValue(distanceDetailsByIndex[checkpointIndex].fromStartNm))} <span>from start</span></div>
                                        <div class="checkpoint-distance-secondary">${escapeHtml(formatDistanceValue(distanceDetailsByIndex[checkpointIndex].fromPreviousNm))} <span>from previous</span></div>
                                    </div>
                                </td>
                                <td data-label="Comms / Notes">
                                    <input type="text" value="${escapeHtml(normalizeCheckpointComms(checkpoint.comms))}" data-field="comms">
                                    ${checkpoint.notes ? `<div class="checkpoint-note">${escapeHtml(checkpoint.notes)}</div>` : ""}
                                </td>
                                <td data-label="Action"><button type="button" class="ghost remove-checkpoint-btn">Remove</button></td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            `;

        legCard.innerHTML = `
            <h2>Leg ${index + 1}: ${legPlan.fromIcao} to ${legPlan.toIcao}</h2>
            <div class="leg-meta">
                <div><strong>Leg distance:</strong> ${legPlan.legDistanceNm.toFixed(1)} NM</div>
                <div><strong>Suggested spacing:</strong> ${legPlan.spacingNm.toFixed(1)} NM</div>
                <div><strong>Route:</strong> ${legPlan.fromIcao} -> ${legPlan.toIcao}</div>
            </div>
            ${checkpointsHtml}
            <div class="checkpoint-card-actions">
                <button type="button" class="ghost add-checkpoint-btn" data-leg-index="${index}">Add Checkpoint</button>
            </div>
        `;

        plannerRoot.appendChild(legCard);
    });

    plannerRoot.querySelectorAll(".add-checkpoint-btn").forEach((button) => {
        button.addEventListener("click", () => {
            const legIndex = Number(button.getAttribute("data-leg-index"));
            addCheckpointToLeg(legIndex);
        });
    });

    plannerRoot.querySelectorAll("[data-checkpoint-row]").forEach((row) => {
        const [legIndex, checkpointIndex] = row.getAttribute("data-checkpoint-row").split(":").map(Number);
        row.querySelectorAll("input").forEach((input) => {
            input.addEventListener("input", () => updateCheckpointFromRow(legIndex, checkpointIndex, row));
        });
        row.querySelector(".remove-checkpoint-btn")?.addEventListener("click", () => {
            currentPlan.legs[legIndex].checkpoints.splice(checkpointIndex, 1);
            renderPlanner();
        });
    });
}

function savePlan() {
    if (!currentDraft || !currentPlan) {
        return;
    }

    persistPlannerPlan();
    showStatus("Checkpoint plan saved. Return to Flight Setup and generate the nav log to populate Table 3.", "info");
}

function openCurrentRouteOnMap() {
    if (!currentDraft || !currentPlan) {
        return;
    }

    persistPlannerPlan();
    window.location.assign("/map.html");
}

function persistPlannerPlan() {
    if (!currentDraft || !currentPlan) {
        return false;
    }

    const previousPlan = loadCheckpointPlan();
    const comparablePlan = {
        ...currentPlan,
        routeSignature: createRouteSignature(currentDraft),
        version: CHECKPOINT_PLAN_VERSION,
        mode: plannerMode,
    };
    currentPlan.routeSignature = createRouteSignature(currentDraft);
    currentPlan.version = CHECKPOINT_PLAN_VERSION;
    currentPlan.savedAt = new Date().toISOString();
    currentPlan.mode = plannerMode;
    saveCheckpointPlan(currentPlan);
    const changed = !checkpointPlansEqual(stripPlanTimestamp(previousPlan), stripPlanTimestamp(comparablePlan));
    if (changed) {
        clearNavLogSnapshot();
    }
    return changed;
}

function stripPlanTimestamp(plan) {
    if (!plan) {
        return null;
    }

    const { savedAt, ...rest } = plan;
    return {
        ...rest,
        mode: rest.mode || "classic",
    };
}

function clearPlan() {
    clearCheckpointPlan();
    regeneratePlan("Saved checkpoints cleared for this route.");
}

function updateCheckpointFromRow(legIndex, checkpointIndex, row) {
    const checkpoint = currentPlan.legs[legIndex].checkpoints[checkpointIndex];
    checkpoint.name = row.querySelector('[data-field="name"]').value.trim() || checkpoint.name;
    checkpoint.comms = row.querySelector('[data-field="comms"]').value.trim() || DEFAULT_CHECKPOINT_NOTE;
}

async function regeneratePlan(message = "Draft checkpoints regenerated for the current route.") {
    try {
        setPlannerBusy(true, "Loading checkpoints...");
        currentPlan = await fetchGeneratedCheckpointPlan();
        setLoadingProgressLabel("Applying checkpoint results...");
        renderPlanner();
        await waitForPlannerRender();
        clearStatus();
    } catch (error) {
        showStatus(error.message, "error");
    } finally {
        setPlannerBusy(false);
    }
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
    plannerRoot.innerHTML = `<div class="empty-state">${message}</div>`;
    regenerateButton.disabled = true;
    saveButton.disabled = true;
    clearButton.disabled = true;
}

function renderSetupRequiredState(message) {
    setPlannerSetupRequiredMode(true);
    plannerRoot.innerHTML = `
        <div class="empty-state setup-required-state">
            <h2>Set Up a Flight First</h2>
            <p>${escapeHtml(message)}</p>
            <div class="empty-state-actions">
                <a class="link-button" href="/index.html">Go to Flight Setup</a>
            </div>
        </div>
    `;
    regenerateButton.disabled = true;
    saveButton.disabled = true;
    clearButton.disabled = true;
}

function setPlannerSetupRequiredMode(isRequired) {
    if (plannerControls) {
        plannerControls.hidden = isRequired;
    }
    if (statusBanner) {
        statusBanner.hidden = isRequired;
    }
    if (loadingProgress) {
        loadingProgress.hidden = isRequired;
    }
}

function normalizeCheckpointComms(value) {
    const normalized = String(value || "").trim();
    return normalized && normalized.toUpperCase() !== "VIS"
        ? normalized
        : DEFAULT_CHECKPOINT_NOTE;
}

function showStatus(message, type) {
    statusBanner.textContent = message;
    statusBanner.className = "status-banner";
    statusBanner.classList.add(type);
}

function clearStatus() {
    statusBanner.textContent = "";
    statusBanner.className = "status-banner";
}

async function fetchGeneratedCheckpointPlan() {
    const url = `/api/checkpoints/generate?mode=${encodeURIComponent(plannerMode)}`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(currentDraft),
    });

    if (!response.ok) {
        const failure = await response.json().catch(() => ({ error: "Checkpoint generation failed." }));
        throw new Error(failure.error || "Checkpoint generation failed.");
    }

    const plan = await response.json();
    const normalizedPlan = {
        version: CHECKPOINT_PLAN_VERSION,
        routeSignature: createRouteSignature(currentDraft),
        mode: plannerMode,
        legs: plan.legs || [],
    };
    saveCheckpointPlan(normalizedPlan);
    return normalizedPlan;
}

function addCheckpointToLeg(legIndex) {
    const legPlan = currentPlan.legs[legIndex];
    if (!legPlan) {
        return;
    }

    const lastDistance = legPlan.checkpoints.length > 0
        ? Number(legPlan.checkpoints[legPlan.checkpoints.length - 1].distanceFromLegStartNm) || 0
        : 0;
    const suggestedDistance = Math.min(
        legPlan.legDistanceNm,
        Math.max(0, lastDistance + Math.max(1, Math.min(legPlan.spacingNm || 5, 10))),
    );

    legPlan.checkpoints.push({
        name: `Custom Checkpoint ${legPlan.checkpoints.length + 1}`,
        distanceFromLegStartNm: Math.round(suggestedDistance * 10) / 10,
        comms: "",
        type: "manual",
        source: "user",
        notes: "User-added checkpoint.",
    });
    renderPlanner();
}

function matchesCheckpointFilters(checkpoint) {
    const matchesType = activeTypeFilter === "all" || checkpoint.type === activeTypeFilter;
    const matchesSource = activeSourceFilter === "all" || checkpoint.source === activeSourceFilter;
    return matchesType && matchesSource;
}

function setPlannerBusy(isBusy, message = "") {
    plannerBusy = isBusy;
    regenerateButton.disabled = isBusy;
    saveButton.disabled = isBusy;
    openMapButton.disabled = isBusy;
    clearButton.disabled = isBusy;
    checkpointTypeFilter.disabled = isBusy;
    checkpointSourceFilter.disabled = isBusy;
    menuNavLinks.forEach((link) => {
        link.classList.toggle("is-disabled", isBusy);
        link.setAttribute("aria-disabled", String(isBusy));
        link.tabIndex = isBusy ? -1 : 0;
    });
    if (isBusy) {
        startLoadingProgress(message || "Loading checkpoints...");
        clearStatus();
    } else {
        stopLoadingProgress();
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("\"", "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function renderCheckpointMeta(checkpoint) {
    const badges = [];
    const typeClass = getCheckpointBadgeClass(checkpoint.type);

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

    return `<div class="checkpoint-meta">${badges.join("")}</div>`;
}

function getCheckpointBadgeClass(type) {
    if (type === "visual_checkpoint") {
        return "visual";
    }
    if (type === "airport") {
        return "airport";
    }
    if (type === "manual") {
        return "manual";
    }
    return "";
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

function formatDistanceValue(distanceNm) {
    return `${Number(distanceNm || 0).toFixed(1)} NM`;
}

function startLoadingProgress(initialMessage) {
    stopLoadingProgressInternal(true);

    progressValue = 8;
    progressStartedAt = Date.now();
    loadingProgress.classList.add("active");
    loadingProgressBar.style.width = `${progressValue}%`;
    loadingProgressLabel.textContent = initialMessage;
    loadingProgressNote.textContent = plannerMode === "enhanced"
        ? "Enhanced checkpoint generation may take a few seconds while candidates are ranked."
        : "Classic checkpoint generation usually finishes quickly.";

    const phases = plannerMode === "enhanced"
        ? [
            { until: 24, label: "Loading route data..." },
            { until: 48, label: "Searching checkpoint candidates..." },
            { until: 72, label: "Ranking visual checkpoints..." },
            { until: 90, label: "Preparing planner results..." },
        ]
        : [
            { until: 35, label: "Loading route data..." },
            { until: 68, label: "Generating draft checkpoints..." },
            { until: 90, label: "Preparing planner results..." },
        ];

    progressTimer = window.setInterval(() => {
        const increment = plannerMode === "enhanced" ? 6 : 10;
        progressValue = Math.min(progressValue + increment, 92);
        loadingProgressBar.style.width = `${progressValue}%`;

        const currentPhase = phases.find((phase) => progressValue <= phase.until) ?? phases[phases.length - 1];
        setLoadingProgressLabel(currentPhase.label);
    }, 350);
}

function setLoadingProgressLabel(message) {
    loadingProgressLabel.textContent = message;
}

function stopLoadingProgress() {
    return stopLoadingProgressInternal(false);
}

async function waitForPlannerRender() {
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function stopLoadingProgressInternal(immediate = false) {
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
