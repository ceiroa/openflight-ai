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
const plannerModeSelect = document.getElementById("planner-mode");
const checkpointTypeFilter = document.getElementById("checkpoint-type-filter");
const checkpointSourceFilter = document.getElementById("checkpoint-source-filter");
const menuToggleButton = document.getElementById("menu-toggle");
const sideMenu = document.getElementById("side-menu");

let currentDraft = null;
let currentPlan = null;
let plannerMode = "classic";
let activeTypeFilter = "all";
let activeSourceFilter = "all";
let progressTimer = null;
let progressValue = 0;

document.addEventListener("DOMContentLoaded", () => {
    menuToggleButton.addEventListener("click", () => {
        setMenuOpenState(!sideMenu.classList.contains("open"));
    });
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("keydown", handleDocumentKeydown);

    currentDraft = loadFlightDraft();
    if (!isUsableDraft(currentDraft)) {
        renderEmptyState("Load the flight on the main page first, then open the checkpoints planner.");
        return;
    }

    initializePlanner();

    regenerateButton.addEventListener("click", () => {
        regeneratePlan();
    });

    plannerModeSelect.addEventListener("change", () => {
        plannerMode = plannerModeSelect.value;
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
        plannerMode = savedPlan.mode || "classic";
        plannerModeSelect.value = plannerMode;
        return;
    }

    currentPlan = await fetchGeneratedCheckpointPlan();
    plannerMode = currentPlan.mode || plannerMode;
    plannerModeSelect.value = plannerMode;
}

function renderPlanner() {
    plannerRoot.innerHTML = "";

    currentPlan.legs.forEach((legPlan, index) => {
        const legCard = document.createElement("section");
        legCard.className = "leg-card";
        const visibleCheckpoints = legPlan.checkpoints
            .map((checkpoint, checkpointIndex) => ({ checkpoint, checkpointIndex }))
            .filter(({ checkpoint }) => matchesCheckpointFilters(checkpoint));

        const checkpointsHtml = legPlan.checkpoints.length === 0
            ? `<div class="empty-state">This leg is short enough that no intermediate checkpoints were generated.</div>`
            : visibleCheckpoints.length === 0
                ? `<div class="empty-state">No checkpoints match the current filters for this leg.</div>`
            : `
                <table>
                    <thead>
                        <tr>
                            <th>Checkpoint Name</th>
                            <th>Distance From Start (NM)</th>
                            <th>Comms / Notes</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${visibleCheckpoints.map(({ checkpoint, checkpointIndex }) => `
                            <tr data-checkpoint-row="${index}:${checkpointIndex}">
                                <td>
                                    <div class="checkpoint-name-cell">
                                        <input type="text" value="${escapeHtml(checkpoint.name)}" data-field="name">
                                        ${renderCheckpointMeta(checkpoint)}
                                    </div>
                                </td>
                                <td><input type="number" step="0.1" min="0" max="${legPlan.legDistanceNm.toFixed(1)}" value="${checkpoint.distanceFromLegStartNm.toFixed(1)}" data-field="distance"></td>
                                <td>
                                    <input type="text" value="${escapeHtml(checkpoint.comms || "VIS")}" data-field="comms">
                                    ${checkpoint.notes ? `<div class="checkpoint-note">${escapeHtml(checkpoint.notes)}</div>` : ""}
                                </td>
                                <td><button type="button" class="ghost remove-checkpoint-btn">Remove</button></td>
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

    const previousPlan = loadCheckpointPlan();
    currentPlan.routeSignature = createRouteSignature(currentDraft);
    currentPlan.version = CHECKPOINT_PLAN_VERSION;
    currentPlan.savedAt = new Date().toISOString();
    currentPlan.mode = plannerMode;
    saveCheckpointPlan(currentPlan);
    if (!checkpointPlansEqual(previousPlan, currentPlan)) {
        clearNavLogSnapshot();
    }
    showStatus("Checkpoint plan saved. Return to Flight Setup and generate the nav log to populate Table 3.", "info");
}

function openCurrentRouteOnMap() {
    if (!currentDraft || !currentPlan) {
        return;
    }

    currentPlan.routeSignature = createRouteSignature(currentDraft);
    currentPlan.version = CHECKPOINT_PLAN_VERSION;
    currentPlan.savedAt = new Date().toISOString();
    currentPlan.mode = plannerMode;
    saveCheckpointPlan(currentPlan);
    window.location.assign("/map.html");
}

function clearPlan() {
    clearCheckpointPlan();
    regeneratePlan("Saved checkpoints cleared for this route.");
}

function updateCheckpointFromRow(legIndex, checkpointIndex, row) {
    const checkpoint = currentPlan.legs[legIndex].checkpoints[checkpointIndex];
    checkpoint.name = row.querySelector('[data-field="name"]').value.trim() || checkpoint.name;
    checkpoint.distanceFromLegStartNm = clampNumber(
        row.querySelector('[data-field="distance"]').value,
        0,
        currentPlan.legs[legIndex].legDistanceNm,
        checkpoint.distanceFromLegStartNm,
    );
    checkpoint.comms = row.querySelector('[data-field="comms"]').value.trim() || "VIS";
}

async function regeneratePlan(message = "Draft checkpoints regenerated for the current route.") {
    try {
        setPlannerBusy(true, "Loading checkpoints...");
        currentPlan = await fetchGeneratedCheckpointPlan();
        renderPlanner();
        showStatus(message, "info");
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
        && Number.isFinite(Number(draft.departure.lat))
        && Number.isFinite(Number(draft.departure.lon))
        && draft.legs.every((leg) => Number.isFinite(Number(leg.lat)) && Number.isFinite(Number(leg.lon)));
}

function renderEmptyState(message) {
    plannerRoot.innerHTML = `<div class="empty-state">${message}</div>`;
    regenerateButton.disabled = true;
    saveButton.disabled = true;
    clearButton.disabled = true;
}

function showStatus(message, type) {
    statusBanner.textContent = message;
    statusBanner.className = "status-banner";
    statusBanner.classList.add(type);
}

async function fetchGeneratedCheckpointPlan() {
    setPlannerBusy(true, "Loading checkpoints...");
    const url = plannerMode === "enhanced"
        ? `/api/checkpoints/generate?mode=${encodeURIComponent(plannerMode)}`
        : "/api/checkpoints/generate";
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
    regenerateButton.disabled = isBusy;
    saveButton.disabled = isBusy;
    openMapButton.disabled = isBusy;
    clearButton.disabled = isBusy;
    if (isBusy) {
        startLoadingProgress(message || "Loading checkpoints...");
        showStatus(message || "Loading checkpoints...", "info");
    } else {
        stopLoadingProgress();
    }
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, numeric));
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

    if (checkpoint.type) {
        badges.push(`<span class="checkpoint-badge">${escapeHtml(formatCheckpointType(checkpoint.type))}</span>`);
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

function startLoadingProgress(initialMessage) {
    stopLoadingProgress();

    progressValue = 8;
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
        loadingProgressLabel.textContent = currentPhase.label;
    }, 350);
}

function stopLoadingProgress() {
    if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = null;
    }

    if (loadingProgress.classList.contains("active")) {
        loadingProgressBar.style.width = "100%";
        window.setTimeout(() => {
            loadingProgress.classList.remove("active");
            loadingProgressBar.style.width = "0%";
        }, 180);
    }
}
