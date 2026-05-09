const DTPP_SEARCH_URL = 'https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/';
const DTPP_HOST = 'https://aeronav.faa.gov';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let dtppCache = null;

export async function getAirportDiagram(icao) {
    const normalized = normalizeAirportCode(icao);
    if (!normalized) {
        throw new Error('Valid airport identifier is required.');
    }

    const metadata = await loadDtppMetadata();
    const airport = findAirportRecord(metadata.xml, normalized);
    if (!airport) {
        return {
            icao: normalized,
            available: false,
            source: 'FAA d-TPP',
            cycle: metadata.cycle,
            effectiveLabel: metadata.effectiveLabel,
            message: `No FAA d-TPP record was found for ${normalized}.`,
        };
    }

    const diagram = airport.records.find((record) => record.chartCode === 'APD');
    if (!diagram?.pdfName) {
        return {
            icao: normalized,
            airportName: airport.airportName,
            available: false,
            source: 'FAA d-TPP',
            cycle: metadata.cycle,
            effectiveLabel: metadata.effectiveLabel,
            message: `No FAA airport diagram is published for ${normalized}.`,
        };
    }

    return {
        icao: airport.icaoIdent || normalized,
        airportIdent: airport.aptIdent,
        airportName: airport.airportName,
        available: true,
        source: 'FAA d-TPP',
        cycle: metadata.cycle,
        effectiveLabel: metadata.effectiveLabel,
        chartName: diagram.chartName || 'Airport Diagram',
        chartCode: diagram.chartCode,
        pdfName: diagram.pdfName,
        pdfUrl: `${DTPP_HOST}/d-tpp/${metadata.cycle}/${diagram.pdfName}`,
        hotSpotCharts: airport.records
            .filter((record) => record.chartCode === 'HOT' && record.pdfName)
            .map((record) => ({
                chartName: record.chartName || 'Hot Spot',
                pdfName: record.pdfName,
                pdfUrl: `${DTPP_HOST}/d-tpp/${metadata.cycle}/${record.pdfName}`,
            })),
    };
}

export function resetAirportDiagramCacheForTests() {
    dtppCache = null;
}

async function loadDtppMetadata() {
    if (dtppCache && Date.now() - dtppCache.loadedAt < CACHE_TTL_MS) {
        return dtppCache;
    }

    const searchResponse = await fetch(DTPP_SEARCH_URL);
    if (!searchResponse.ok) {
        throw new Error(`FAA d-TPP search page returned ${searchResponse.status}`);
    }

    const searchHtml = await searchResponse.text();
    const currentMatch = searchHtml.match(/Current Edition:\s*<a href="(https:\/\/aeronav\.faa\.gov\/d-tpp\/(\d+)\/xml_data\/d-tpp_Metafile\.xml)">([^<]+)<\/a>/i)
        || searchHtml.match(/href="(https:\/\/aeronav\.faa\.gov\/d-tpp\/(\d+)\/xml_data\/d-tpp_Metafile\.xml)"/i);
    if (!currentMatch) {
        throw new Error('FAA d-TPP current metafile link was not found.');
    }

    const [, xmlUrl, cycle, effectiveLabel = 'Current FAA d-TPP cycle'] = currentMatch;
    const xmlResponse = await fetch(xmlUrl);
    if (!xmlResponse.ok) {
        throw new Error(`FAA d-TPP metafile returned ${xmlResponse.status}`);
    }

    dtppCache = {
        loadedAt: Date.now(),
        cycle,
        effectiveLabel: decodeHtmlEntities(stripTags(effectiveLabel)),
        xml: await xmlResponse.text(),
    };
    return dtppCache;
}

function findAirportRecord(xml, icao) {
    const targetIcao = normalizeAirportCode(icao);
    const targetApt = targetIcao.startsWith('K') ? targetIcao.slice(1) : targetIcao;
    const airportRegex = /<airport_name\b([^>]*)>([\s\S]*?)<\/airport_name>/gi;
    let match;

    while ((match = airportRegex.exec(xml)) !== null) {
        const attributes = parseAttributes(match[1]);
        const icaoIdent = normalizeAirportCode(attributes.icao_ident || '');
        const aptIdent = normalizeAirportCode(attributes.apt_ident || '');
        if (icaoIdent !== targetIcao && aptIdent !== targetApt) {
            continue;
        }

        return {
            airportName: decodeHtmlEntities(attributes.ID || attributes.id || targetIcao),
            icaoIdent,
            aptIdent: String(attributes.apt_ident || '').trim().toUpperCase(),
            records: parseRecords(match[2]),
        };
    }

    return null;
}

function parseRecords(content) {
    const records = [];
    const recordRegex = /<record>([\s\S]*?)<\/record>/gi;
    let match;

    while ((match = recordRegex.exec(content)) !== null) {
        records.push({
            chartCode: extractTagValue(match[1], 'chart_code'),
            chartName: extractTagValue(match[1], 'chart_name'),
            pdfName: extractTagValue(match[1], 'pdf_name'),
        });
    }

    return records;
}

function parseAttributes(rawAttributes) {
    const attributes = {};
    const attributeRegex = /([a-zA-Z0-9_:-]+)="([^"]*)"/g;
    let match;
    while ((match = attributeRegex.exec(rawAttributes)) !== null) {
        attributes[match[1]] = decodeHtmlEntities(match[2]);
    }
    return attributes;
}

function extractTagValue(content, tagName) {
    const match = content.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
    return match ? decodeHtmlEntities(match[1].trim()) : '';
}

function normalizeAirportCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) {
        return '';
    }
    return raw.length === 3 && /^[A-Z0-9]{3}$/.test(raw) ? `K${raw}` : raw;
}

function stripTags(value) {
    return String(value || '').replace(/<[^>]*>/g, '');
}

function decodeHtmlEntities(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&ndash;/g, '-')
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
