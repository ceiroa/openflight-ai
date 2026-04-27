import {
    CHECKPOINT_PLAN_VERSION,
    checkpointPlanLooksLegacy,
    loadFlightDraft,
    saveCheckpointPlan,
    getCheckpointPlanForRoute,
    clearCheckpointPlan,
    createRouteSignature,
} from "./flightStore.js";

const plannerRoot = document.getElementById("planner-root");
const statusBanner = document.getElementById("status-banner");
const regenerateButton = document.getElementById("regenerate-btn");
const saveButton = document.getElementById("save-btn");
const openMapButton = document.getElementById("open-map-btn");
const clearButton = document.getElementById("clear-btn");
const menuToggleButton = document.getElementById("menu-toggle");
const sideMenu = document.getElementById("side-menu");

let currentDraft = null;
let currentPlan = null;

document.addEventListener("DOMContentLoaded", () => {
    menuToggleButton.addEventListener("click", () => {
        sideMenu.classList.toggle("open");
        menuToggleButton.classList.toggle("open");
    });

    currentDraft = loadFlightDraft();
    if (!isUsableDraft(currentDraft)) {
        renderEmptyState("Load the flight on the main page first, then open the checkpoints planner.");
        return;
    }

    initializePlanner();

    regenerateButton.addEventListener("click", () => {
        regeneratePlan();
    });

    saveButton.addEventListener("click", savePlan);
    openMapButton.addEventListener("click", openCurrentRouteOnMap);
    clearButton.addEventListener("click", clearPlan);
});

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
        return;
    }

    currentPlan = await fetchGeneratedCheckpointPlan();
}

function renderPlanner() {
    plannerRoot.innerHTML = "";

    currentPlan.legs.forEach((legPlan, index) => {
        const legCard = document.createElement("section");
        legCard.className = "leg-card";

        const checkpointsHtml = legPlan.checkpoints.length === 0
            ? `<div class="empty-state">This leg is short enough that no intermediate checkpoints were generated.</div>`
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
                        ${legPlan.checkpoints.map((checkpoint, checkpointIndex) => `
                            <tr data-checkpoint-row="${index}:${checkpointIndex}">
                                <td><input type="text" value="${escapeHtml(checkpoint.name)}" data-field="name"></td>
                                <td><input type="number" step="0.1" min="0" max="${legPlan.legDistanceNm.toFixed(1)}" value="${checkpoint.distanceFromLegStartNm.toFixed(1)}" data-field="distance"></td>
                                <td><input type="text" value="${escapeHtml(checkpoint.comms || "VIS")}" data-field="comms"></td>
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

    currentPlan.routeSignature = createRouteSignature(currentDraft);
    currentPlan.version = CHECKPOINT_PLAN_VERSION;
    currentPlan.savedAt = new Date().toISOString();
    saveCheckpointPlan(currentPlan);
    showStatus("Checkpoint plan saved. Return to Flight Setup and generate the nav log to populate Table 3.", "info");
}

function openCurrentRouteOnMap() {
    if (!currentDraft || !currentPlan) {
        return;
    }

    currentPlan.routeSignature = createRouteSignature(currentDraft);
    currentPlan.version = CHECKPOINT_PLAN_VERSION;
    currentPlan.savedAt = new Date().toISOString();
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
    const response = await fetch("/api/checkpoints/generate", {
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
    });
    renderPlanner();
}

function setPlannerBusy(isBusy, message = "") {
    regenerateButton.disabled = isBusy;
    saveButton.disabled = isBusy;
    openMapButton.disabled = isBusy;
    clearButton.disabled = isBusy;
    if (isBusy) {
        showStatus(message || "Loading checkpoints...", "info");
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
