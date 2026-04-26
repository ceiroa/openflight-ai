export const SETTINGS_STORAGE_KEY = "openflight-ai-settings";
export const FLIGHT_DRAFT_STORAGE_KEY = "openflight-ai-flight-draft";
export const CHECKPOINTS_STORAGE_KEY = "openflight-ai-checkpoints";
export const CHECKPOINT_PLAN_VERSION = 2;

export function normalizeAirportCode(value) {
    const normalized = value.trim().toUpperCase();
    if (normalized.length === 3 && /^[A-Z]{3}$/.test(normalized)) {
        return `K${normalized}`;
    }
    return normalized;
}

export function createRouteSignature(inputs) {
    const route = {
        departure: {
            icao: normalizeAirportCode(inputs?.departure?.icao || ""),
            lat: normalizeNumber(inputs?.departure?.lat),
            lon: normalizeNumber(inputs?.departure?.lon),
        },
        legs: Array.isArray(inputs?.legs) ? inputs.legs.map((leg) => ({
            icao: normalizeAirportCode(leg?.icao || ""),
            lat: normalizeNumber(leg?.lat),
            lon: normalizeNumber(leg?.lon),
        })) : [],
    };

    return JSON.stringify(route);
}

export function saveFlightDraft(inputs) {
    localStorage.setItem(FLIGHT_DRAFT_STORAGE_KEY, JSON.stringify(inputs));
}

export function loadFlightDraft() {
    return readJsonStorage(FLIGHT_DRAFT_STORAGE_KEY);
}

export function saveCheckpointPlan(plan) {
    localStorage.setItem(CHECKPOINTS_STORAGE_KEY, JSON.stringify(plan));
}

export function loadCheckpointPlan() {
    return readJsonStorage(CHECKPOINTS_STORAGE_KEY);
}

export function clearCheckpointPlan() {
    localStorage.removeItem(CHECKPOINTS_STORAGE_KEY);
}

export function checkpointPlanLooksLegacy(plan) {
    return !Array.isArray(plan?.legs)
        || plan.version !== CHECKPOINT_PLAN_VERSION;
}

export function getCheckpointPlanForRoute(inputs) {
    const plan = loadCheckpointPlan();
    if (!plan) {
        return null;
    }

    if (plan.routeSignature !== createRouteSignature(inputs)) {
        return null;
    }

    if (checkpointPlanLooksLegacy(plan)) {
        return null;
    }

    return plan;
}

function readJsonStorage(key) {
    const raw = localStorage.getItem(key);
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function normalizeNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }

    return Math.round(numeric * 10000) / 10000;
}
