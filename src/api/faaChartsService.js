const FAA_VFR_RASTER_URL = 'https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/vfr/index.cfm';

let vfrRasterPageCache = null;

export function __resetFaaChartsCache() {
    vfrRasterPageCache = null;
}

export async function getCurrentSectionalChartMetadata(chartDisplayName) {
    const baseName = normalizeSectionalChartName(chartDisplayName);
    if (!baseName) {
        throw new Error('Sectional chart name is required.');
    }

    const pageHtml = await loadVfrRasterPage();
    const url = extractCurrentSectionalZipUrl(pageHtml, baseName);
    if (!url) {
        throw new Error(`Current FAA sectional chart ZIP was not found for "${chartDisplayName}".`);
    }

    return {
        chartName: `${baseName} Sectional`,
        zipUrl: url,
        sourceUrl: FAA_VFR_RASTER_URL,
    };
}

async function loadVfrRasterPage() {
    if (!vfrRasterPageCache) {
        vfrRasterPageCache = fetch(FAA_VFR_RASTER_URL, {
            headers: {
                'User-Agent': 'CieloRumbo/1.0 faa-chart-overlay',
            },
        }).then(async (response) => {
            if (!response.ok) {
                throw new Error(`FAA VFR raster chart page returned ${response.status}`);
            }

            return response.text();
        });
    }

    return vfrRasterPageCache;
}

function normalizeSectionalChartName(chartDisplayName) {
    return String(chartDisplayName || '')
        .replace(/\s+Sectional$/i, '')
        .trim();
}

function extractCurrentSectionalZipUrl(pageHtml, baseName) {
    const escapedName = escapeRegex(baseName);
    const rowPattern = new RegExp(`${escapedName}\\s+[A-Z][a-z]{2}\\s+\\d{1,2}\\s+\\d{4}[\\s\\S]*?<a[^>]+href="([^"]+?\\.zip)"`, 'i');
    const rowMatch = pageHtml.match(rowPattern);
    if (!rowMatch?.[1]) {
        return null;
    }

    return rowMatch[1];
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
