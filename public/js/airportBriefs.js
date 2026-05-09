import { loadFlightDraft, normalizeAirportCode } from "./flightStore.js";

const root = document.getElementById("briefs-root");
const statusBanner = document.getElementById("status-banner");
const menuToggleButton = document.getElementById("menu-toggle");
const sideMenu = document.getElementById("side-menu");

document.addEventListener("DOMContentLoaded", () => {
    menuToggleButton.addEventListener("click", () => {
        setMenuOpenState(!sideMenu.classList.contains("open"));
    });
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("keydown", handleDocumentKeydown);

    void renderAirportBriefs();
});

async function renderAirportBriefs() {
    const draft = loadFlightDraft();
    if (!isUsableDraft(draft)) {
        renderSetupRequiredState();
        return;
    }

    const airports = getRouteAirports(draft);
    root.innerHTML = airports
        .map((airport) => renderLoadingCard(airport))
        .join("");
    showStatus(`Loading FAA airport diagrams for ${airports.length} airport${airports.length === 1 ? "" : "s"}...`, "info");

    const results = await Promise.all(airports.map(loadAirportDiagram));
    root.innerHTML = results.map(renderBriefCard).join("");
    clearStatus();
}

async function loadAirportDiagram(airport) {
    try {
        const response = await fetch(`/api/airport/${encodeURIComponent(airport.icao)}/diagram`);
        if (!response.ok) {
            const failure = await response.json().catch(() => ({ error: "Airport diagram lookup failed." }));
            throw new Error(failure.error || `Airport diagram lookup failed for ${airport.icao}.`);
        }

        return {
            ...airport,
            diagram: await response.json(),
        };
    } catch (error) {
        return {
            ...airport,
            diagram: {
                available: false,
                message: error.message,
            },
        };
    }
}

function getRouteAirports(draft) {
    const airports = [];
    const seen = new Set();
    const addAirport = (icao, role) => {
        const normalized = normalizeAirportCode(icao);
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        airports.push({ icao: normalized, role });
    };

    addAirport(draft.departure?.icao, "Departure");
    draft.legs.forEach((leg, index) => {
        addAirport(leg.icao, index === draft.legs.length - 1 ? "Final destination" : `Destination ${index + 1}`);
    });

    return airports;
}

function renderLoadingCard(airport) {
    return `
        <section class="brief-card" data-airport-brief="${escapeHtml(airport.icao)}">
            <div class="brief-card-header">
                <div>
                    <h2 class="brief-card-title">${escapeHtml(airport.icao)}</h2>
                    <p class="brief-card-subtitle">${escapeHtml(airport.role)} airport diagram loading...</p>
                </div>
            </div>
        </section>
    `;
}

function renderBriefCard(result) {
    const diagram = result.diagram || {};
    const title = diagram.airportName
        ? `${diagram.icao || result.icao} - ${diagram.airportName}`
        : result.icao;
    const effectiveLabel = diagram.effectiveLabel ? `<span class="brief-pill">${escapeHtml(diagram.effectiveLabel)}</span>` : "";
    const source = diagram.source ? `<span class="brief-pill">${escapeHtml(diagram.source)}</span>` : "";

    if (!diagram.available) {
        return `
            <section class="brief-card" data-airport-brief="${escapeHtml(result.icao)}">
                <div class="brief-card-header">
                    <div>
                        <h2 class="brief-card-title">${escapeHtml(title)}</h2>
                        <p class="brief-card-subtitle">${escapeHtml(result.role)}</p>
                        <div class="brief-meta">${source}${effectiveLabel}</div>
                    </div>
                </div>
                <div class="brief-unavailable">${escapeHtml(diagram.message || `No FAA airport diagram is available for ${result.icao}.`)}</div>
            </section>
        `;
    }

    const hotSpotLinks = Array.isArray(diagram.hotSpotCharts) && diagram.hotSpotCharts.length > 0
        ? diagram.hotSpotCharts.map((chart) => `<a class="link-button ghost" href="${escapeAttribute(chart.pdfUrl)}" target="_blank" rel="noreferrer">${escapeHtml(chart.chartName)}</a>`).join("")
        : "";

    return `
        <section class="brief-card" data-airport-brief="${escapeHtml(result.icao)}">
            <div class="brief-card-header">
                <div>
                    <h2 class="brief-card-title">${escapeHtml(title)}</h2>
                    <p class="brief-card-subtitle">${escapeHtml(result.role)} - ${escapeHtml(diagram.chartName || "Airport Diagram")}</p>
                    <div class="brief-meta">${source}${effectiveLabel}</div>
                </div>
                <div class="brief-card-actions">
                    <a class="link-button" href="${escapeAttribute(diagram.pdfUrl)}" target="_blank" rel="noreferrer">Open PDF</a>
                    ${hotSpotLinks}
                </div>
            </div>
            <div class="diagram-frame-wrap">
                <iframe class="diagram-frame" title="${escapeAttribute(`${result.icao} airport diagram`)}" src="${escapeAttribute(diagram.pdfUrl)}"></iframe>
            </div>
        </section>
    `;
}

function renderSetupRequiredState() {
    root.innerHTML = `
        <div class="empty-state setup-required-state">
            <h2>Set Up a Flight First</h2>
            <p>Enter a departure and at least one destination in Flight Setup before opening Airport Briefs.</p>
            <div class="empty-state-actions">
                <a class="link-button" href="/index.html">Go to Flight Setup</a>
            </div>
        </div>
    `;
}

function isUsableDraft(draft) {
    return draft
        && draft.departure
        && String(draft.departure.icao || "").trim().length >= 3
        && Array.isArray(draft.legs)
        && draft.legs.some((leg) => String(leg?.icao || "").trim().length >= 3);
}

function showStatus(message, type = "info") {
    statusBanner.textContent = message;
    statusBanner.className = "status-banner";
    statusBanner.classList.add(type);
}

function clearStatus() {
    statusBanner.textContent = "";
    statusBanner.className = "status-banner";
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

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
