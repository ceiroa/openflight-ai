import { jest } from '@jest/globals';
import { getAirportDiagram, resetAirportDiagramCacheForTests } from '../../src/api/airportDiagramService.js';

describe('airport diagram service', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        resetAirportDiagramCacheForTests();
        jest.restoreAllMocks();
    });

    test('returns FAA airport diagram metadata from the current d-TPP metafile', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () => `
                    <li>Current Edition: <a href="https://aeronav.faa.gov/d-tpp/2604/xml_data/d-tpp_Metafile.xml">Apr 16&ndash;May 14, 2026</a></li>
                `,
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => `
                    <airport_name ID="CHICAGO O'HARE INTL" military="N" apt_ident="ORD" icao_ident="KORD" alnum="166">
                        <record>
                            <chartseq>70000</chartseq>
                            <chart_code>APD</chart_code>
                            <chart_name>AIRPORT DIAGRAM</chart_name>
                            <pdf_name>00166AD.PDF</pdf_name>
                        </record>
                        <record>
                            <chartseq>10700</chartseq>
                            <chart_code>HOT</chart_code>
                            <chart_name>HOT SPOT</chart_name>
                            <pdf_name>EC3HOTSPOT.PDF</pdf_name>
                        </record>
                    </airport_name>
                `,
            });

        const diagram = await getAirportDiagram('ord');

        expect(diagram).toMatchObject({
            icao: 'KORD',
            airportIdent: 'ORD',
            airportName: "CHICAGO O'HARE INTL",
            available: true,
            cycle: '2604',
            effectiveLabel: 'Apr 16-May 14, 2026',
            chartName: 'AIRPORT DIAGRAM',
            pdfUrl: 'https://aeronav.faa.gov/d-tpp/2604/00166AD.PDF',
            hotSpotCharts: [
                {
                    chartName: 'HOT SPOT',
                    pdfUrl: 'https://aeronav.faa.gov/d-tpp/2604/EC3HOTSPOT.PDF',
                },
            ],
        });
    });

    test('returns unavailable when no airport diagram is published', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () => '<a href="https://aeronav.faa.gov/d-tpp/2604/xml_data/d-tpp_Metafile.xml">Current</a>',
            })
            .mockResolvedValueOnce({
                ok: true,
                text: async () => `
                    <airport_name ID="AURORA MUNI" military="N" apt_ident="ARR" icao_ident="KARR" alnum="123">
                        <record>
                            <chart_code>IAP</chart_code>
                            <chart_name>RNAV RWY 27</chart_name>
                            <pdf_name>00123R27.PDF</pdf_name>
                        </record>
                    </airport_name>
                `,
            });

        const diagram = await getAirportDiagram('KARR');

        expect(diagram).toMatchObject({
            icao: 'KARR',
            airportName: 'AURORA MUNI',
            available: false,
            message: 'No FAA airport diagram is published for KARR.',
        });
    });
});
