import {
    loadFlightDraft,
    saveCheckpointPlan,
    loadCheckpointPlan,
    clearCheckpointPlan,
    createRouteSignature,
    normalizeAirportCode,
} from "./flightStore.js";

const plannerRoot = document.getElementById("planner-root");
const statusBanner = document.getElementById("status-banner");
const regenerateButton = document.getElementById("regenerate-btn");
const saveButton = document.getElementById("save-btn");
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

    hydratePlan();
    renderPlanner();

    regenerateButton.addEventListener("click", () => {
        currentPlan = generateCheckpointPlan(currentDraft);
        renderPlanner();
        showStatus("Draft checkpoints regenerated for the current route.", "info");
    });

    saveButton.addEventListener("click", savePlan);
    clearButton.addEventListener("click", clearPlan);
});

function hydratePlan() {
    const savedPlan = loadCheckpointPlan();
    const routeSignature = createRouteSignature(currentDraft);

    if (savedPlan?.routeSignature === routeSignature && Array.isArray(savedPlan.legs)) {
        currentPlan = savedPlan;
        return;
    }

    currentPlan = generateCheckpointPlan(currentDraft);
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
        `;

        plannerRoot.appendChild(legCard);
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
    currentPlan.savedAt = new Date().toISOString();
    saveCheckpointPlan(currentPlan);
    showStatus("Checkpoint plan saved. Return to Flight Setup and generate the nav log to populate Table 3.", "info");
}

function clearPlan() {
    clearCheckpointPlan();
    currentPlan = generateCheckpointPlan(currentDraft);
    renderPlanner();
    showStatus("Saved checkpoints cleared for this route.", "info");
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

function generateCheckpointPlan(draft) {
    let prevPoint = {
        icao: normalizeAirportCode(draft.departure.icao),
        lat: Number(draft.departure.lat),
        lon: Number(draft.departure.lon),
    };

    const legs = draft.legs.map((leg, index) => {
        const nextPoint = {
            icao: normalizeAirportCode(leg.icao),
            lat: Number(leg.lat),
            lon: Number(leg.lon),
        };

        const legDistanceNm = getDistance(prevPoint.lat, prevPoint.lon, nextPoint.lat, nextPoint.lon);
        const segmentCount = Math.max(1, Math.round(legDistanceNm / 7));
        const spacingNm = legDistanceNm / segmentCount;
        const checkpoints = [];

        for (let checkpointNumber = 1; checkpointNumber < segmentCount; checkpointNumber += 1) {
            const fraction = checkpointNumber / segmentCount;
            const distanceFromLegStartNm = legDistanceNm * fraction;
            checkpoints.push({
                name: `${prevPoint.icao}-${nextPoint.icao} CP${checkpointNumber}`,
                distanceFromLegStartNm: Math.round(distanceFromLegStartNm * 10) / 10,
                fraction,
                comms: "VIS",
            });
        }

        const legPlan = {
            legIndex: index,
            fromIcao: prevPoint.icao,
            toIcao: nextPoint.icao,
            legDistanceNm,
            spacingNm,
            checkpoints,
        };

        prevPoint = nextPoint;
        return legPlan;
    });

    return {
        routeSignature: createRouteSignature(draft),
        legs,
    };
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
