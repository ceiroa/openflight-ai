const menuToggleButton = document.getElementById("menu-toggle");
const sideMenu = document.getElementById("side-menu");
const statusBanner = document.getElementById("status-banner");
const profileList = document.getElementById("profile-list");
const newProfileButton = document.getElementById("new-profile-btn");
const refreshProfilesButton = document.getElementById("refresh-profiles-btn");
const saveProfileButton = document.getElementById("save-profile-btn");
const validationIssues = document.getElementById("validation-issues");

let profiles = [];
let activeProfileId = null;

document.addEventListener("DOMContentLoaded", async () => {
    menuToggleButton.addEventListener("click", () => {
        setMenuOpenState(!sideMenu.classList.contains("open"));
    });
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("keydown", handleDocumentKeydown);
    newProfileButton.addEventListener("click", () => selectProfile(createEmptyProfile()));
    refreshProfilesButton.addEventListener("click", loadProfiles);
    saveProfileButton.addEventListener("click", saveProfile);

    await loadProfiles();
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

async function loadProfiles() {
    try {
        const response = await fetch("/api/aircraft");
        if (!response.ok) {
            throw new Error(`Aircraft profile list failed with status ${response.status}`);
        }

        profiles = await response.json();
        renderProfileList();

        if (profiles.length > 0) {
            const selectedId = activeProfileId && profiles.some((profile) => profile.id === activeProfileId)
                ? activeProfileId
                : profiles[0].id;
            await loadProfile(selectedId);
        } else {
            selectProfile(createEmptyProfile());
        }
    } catch (error) {
        showStatus(error.message, "error");
    }
}

async function loadProfile(id) {
    try {
        const response = await fetch(`/api/aircraft/${encodeURIComponent(id)}`);
        if (!response.ok) {
            throw new Error(`Aircraft profile lookup failed with status ${response.status}`);
        }

        const profile = await response.json();
        selectProfile(profile);
    } catch (error) {
        showStatus(error.message, "error");
    }
}

function renderProfileList() {
    profileList.innerHTML = profiles.map((profile) => `
        <button type="button" class="profile-card${profile.id === activeProfileId ? ' active' : ''}" data-profile-id="${profile.id}">
            <div class="profile-card-header">
                <strong class="profile-card-title">${escapeHtml(formatProfileCardTitle(profile))}</strong>
                <span class="badge ${profile.complete ? 'complete' : 'incomplete'}">${profile.complete ? 'Complete' : 'Needs Work'}</span>
            </div>
            <div class="profile-card-meta">${escapeHtml(formatProfileCardMeta(profile))}</div>
        </button>
    `).join("");

    profileList.querySelectorAll("[data-profile-id]").forEach((button) => {
        button.addEventListener("click", async () => {
            await loadProfile(button.getAttribute("data-profile-id"));
        });
    });
}

function selectProfile(profile) {
    activeProfileId = profile.id || null;
    document.getElementById("profile-id").value = profile.id || "";
    document.getElementById("profile-aircraft").value = profile.aircraft || "";
    document.getElementById("profile-manufacturer").value = profile.manufacturer || "";
    document.getElementById("profile-model").value = profile.model || "";
    document.getElementById("profile-engine").value = profile.engine || "";
    document.getElementById("profile-source-notes").value = profile.source_notes || "";
    document.getElementById("climb-speed").value = profile.profiles?.climb?.speed_kts ?? "";
    document.getElementById("climb-rpm").value = profile.profiles?.climb?.rpm ?? "";
    document.getElementById("climb-fuel").value = profile.profiles?.climb?.fuel_burn_gph ?? "";
    document.getElementById("climb-rate").value = profile.profiles?.climb?.rate_of_climb_fpm ?? "";
    document.getElementById("cruise-speed").value = (profile.profiles?.cruise65 ?? profile.profiles?.cruise)?.speed_kts ?? "";
    document.getElementById("cruise-rpm").value = (profile.profiles?.cruise65 ?? profile.profiles?.cruise)?.rpm ?? "";
    document.getElementById("cruise-fuel").value = (profile.profiles?.cruise65 ?? profile.profiles?.cruise)?.fuel_burn_gph ?? "";
    document.getElementById("limit-vne").value = profile.limits?.vne_kts ?? "";
    document.getElementById("limit-vs").value = profile.limits?.vs_kts ?? "";
    document.getElementById("limit-max-rpm").value = profile.limits?.max_rpm ?? "";
    document.getElementById("climb-table-json").value = JSON.stringify(profile.profiles?.climb?.climbTable ?? [], null, 2);
    validationIssues.textContent = "";
    renderProfileList();
}

async function saveProfile() {
    let climbTable;
    try {
        climbTable = JSON.parse(document.getElementById("climb-table-json").value || "[]");
    } catch {
        showStatus("Climb table JSON is invalid.", "error");
        return;
    }

    const profile = {
        id: document.getElementById("profile-id").value.trim(),
        aircraft: document.getElementById("profile-aircraft").value.trim(),
        manufacturer: document.getElementById("profile-manufacturer").value.trim(),
        model: document.getElementById("profile-model").value.trim(),
        engine: document.getElementById("profile-engine").value.trim(),
        source_notes: document.getElementById("profile-source-notes").value.trim(),
        profiles: {
            climb: {
                speed_kts: numberOrNull(document.getElementById("climb-speed").value),
                rpm: numberOrNull(document.getElementById("climb-rpm").value),
                fuel_burn_gph: numberOrNull(document.getElementById("climb-fuel").value),
                rate_of_climb_fpm: numberOrNull(document.getElementById("climb-rate").value),
                climbTable,
            },
            cruise65: {
                speed_kts: numberOrNull(document.getElementById("cruise-speed").value),
                rpm: numberOrNull(document.getElementById("cruise-rpm").value),
                fuel_burn_gph: numberOrNull(document.getElementById("cruise-fuel").value),
            },
        },
        limits: {
            vne_kts: numberOrNull(document.getElementById("limit-vne").value),
            vs_kts: numberOrNull(document.getElementById("limit-vs").value),
            max_rpm: numberOrNull(document.getElementById("limit-max-rpm").value),
        },
    };

    const targetId = profile.id || sanitizeId(profile.aircraft);
    const method = profiles.some((item) => item.id === targetId) ? "PUT" : "POST";
    const url = method === "PUT" ? `/api/aircraft/${encodeURIComponent(targetId)}` : "/api/aircraft";

    try {
        const response = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(profile),
        });

        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.error || "Failed to save aircraft profile.");
        }

        validationIssues.textContent = payload.validation.complete
            ? "Profile is complete."
            : payload.validation.issues.join(" | ");
        showStatus(`Saved profile ${payload.profile.aircraft}.`, "info");
        await loadProfiles();
        await loadProfile(payload.profile.id);
    } catch (error) {
        showStatus(error.message, "error");
    }
}

function createEmptyProfile() {
    return {
        id: "",
        aircraft: "",
        manufacturer: "",
        model: "",
        engine: "",
        source_notes: "",
        profiles: {
            climb: {
                speed_kts: null,
                rpm: null,
                fuel_burn_gph: null,
                rate_of_climb_fpm: null,
                climbTable: [],
            },
            cruise65: {
                speed_kts: null,
                rpm: null,
                fuel_burn_gph: null,
            },
        },
        limits: {
            vne_kts: null,
            vs_kts: null,
            max_rpm: null,
        },
    };
}

function showStatus(message, type) {
    statusBanner.textContent = message;
    statusBanner.className = "status-banner";
    statusBanner.classList.add(type);
}

function numberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function sanitizeId(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
}

function formatProfileCardTitle(profile) {
    const aircraftName = String(profile.aircraft || profile.id || "").trim();
    const engineName = String(profile.engine || "").trim();
    return engineName ? `${aircraftName} / ${engineName}` : aircraftName;
}

function formatProfileCardMeta(profile) {
    const details = [profile.manufacturer, profile.model].filter(Boolean);
    return details.join(" | ") || profile.id;
}
