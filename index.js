import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWeatherData } from './src/api/weatherService.js';
import {
    getAircraftProfileById,
    getAircraftProfileByName,
    listAircraftProfiles,
    normalizeAircraftProfile,
    saveAircraftProfile,
    validateAircraftProfile,
} from './src/aircraftProfiles.js';
import {
    generateClassicCheckpointsForRoute,
    generateEnhancedCheckpointsForRoute,
    generateNamedCheckpointsForRoute,
    getCuratedVisualCheckpointsInBounds,
    getAirportCommsByCode,
} from './src/api/airportReferenceService.js';
import { getAirspaceForBounds } from './src/api/airspaceService.js';
import { getCurrentSectionalChartMetadata } from './src/api/faaChartsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/docs', express.static(path.join(__dirname, 'docs')));
app.use(express.json());

app.get('/docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

// API endpoints to get or list aircraft data
app.get('/api/aircraft', async (req, res) => {
    try {
        const { name } = req.query;
        if (name) {
            const profile = await getAircraftProfileByName(String(name));
            res.json(profile);
            return;
        }

        const profiles = await listAircraftProfiles();
        res.json(profiles);
    } catch (error) {
        const status = error.message?.includes('was not found') ? 404 : 500;
        res.status(status).json({ error: error.message || 'Failed to load aircraft data' });
    }
});

app.get('/api/aircraft/:id', async (req, res) => {
    try {
        const profile = await getAircraftProfileById(req.params.id);
        res.json(profile);
    } catch (error) {
        res.status(404).json({ error: error.message || 'Aircraft profile not found' });
    }
});

app.post('/api/aircraft', async (req, res) => {
    try {
        const normalized = normalizeAircraftProfile(req.body);
        const validation = validateAircraftProfile(normalized);
        const saved = await saveAircraftProfile(normalized);
        res.status(201).json({ profile: saved, validation });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Failed to save aircraft profile' });
    }
});

app.put('/api/aircraft/:id', async (req, res) => {
    try {
        const normalized = normalizeAircraftProfile({ ...req.body, id: req.params.id });
        const validation = validateAircraftProfile(normalized);
        const saved = await saveAircraftProfile(normalized);
        res.json({ profile: saved, validation });
    } catch (error) {
        res.status(400).json({ error: error.message || 'Failed to update aircraft profile' });
    }
});

app.get('/api/airport/:icao/comms', async (req, res) => {
    try {
        const comms = await getAirportCommsByCode(req.params.icao.toUpperCase());
        res.json(comms);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to load airport communications' });
    }
});

app.get('/api/checkpoints/reference', async (req, res) => {
    try {
        const checkpoints = getCuratedVisualCheckpointsInBounds({
            minLat: req.query.minLat,
            minLon: req.query.minLon,
            maxLat: req.query.maxLat,
            maxLon: req.query.maxLon,
        });
        res.json({ checkpoints });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to load reference checkpoints' });
    }
});

app.get('/api/airspace', async (req, res) => {
    try {
        const classes = String(req.query.classes || 'B,C,D,E')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        const airspace = await getAirspaceForBounds({
            minLat: req.query.minLat,
            minLon: req.query.minLon,
            maxLat: req.query.maxLat,
            maxLon: req.query.maxLon,
        }, { classes });
        res.json(airspace);
    } catch (error) {
        const status = error.message?.includes('bounds') ? 400 : 500;
        res.status(status).json({ error: error.message || 'Failed to load FAA airspace data' });
    }
});

app.get('/api/charts/sectional', async (req, res) => {
    try {
        const name = String(req.query.name || '').trim();
        if (!name) {
            res.status(400).json({ error: 'Sectional chart name is required.' });
            return;
        }

        const metadata = await getCurrentSectionalChartMetadata(name);
        res.json(metadata);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to load FAA sectional chart metadata' });
    }
});

app.get('/api/charts/sectional/content', async (req, res) => {
    try {
        const name = String(req.query.name || '').trim();
        if (!name) {
            res.status(400).json({ error: 'Sectional chart name is required.' });
            return;
        }

        const metadata = await getCurrentSectionalChartMetadata(name);
        const upstream = await fetch(metadata.zipUrl, {
            headers: {
                'User-Agent': 'OpenFlight-AI/1.0 faa-chart-overlay',
            },
        });

        if (!upstream.ok) {
            res.status(502).json({ error: `FAA chart ZIP returned ${upstream.status}` });
            return;
        }

        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Cache-Control', 'no-store');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to load FAA sectional chart content' });
    }
});

app.post('/api/checkpoints/generate', async (req, res) => {
    try {
        const draft = req.body;
        const mode = String(req.query.mode || 'classic').toLowerCase();
        const legs = mode === 'enhanced'
            ? await generateEnhancedCheckpointsForRoute(draft)
            : mode === 'classic'
                ? await generateClassicCheckpointsForRoute(draft)
                : await generateNamedCheckpointsForRoute(draft);
        res.json({
            mode,
            routeSignature: draft ? JSON.stringify({
                departure: {
                    icao: draft.departure?.icao || '',
                    lat: Number(draft.departure?.lat),
                    lon: Number(draft.departure?.lon),
                },
                legs: Array.isArray(draft.legs) ? draft.legs.map((leg) => ({
                    icao: leg.icao || '',
                    lat: Number(leg.lat),
                    lon: Number(leg.lon),
                })) : [],
            }) : '',
            legs,
        });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to generate checkpoints' });
    }
});

// API endpoint to get weather data by ICAO (Path Parameter)
app.get('/api/weather/:icao', async (req, res) => {
    const { icao } = req.params;
    try {
        const weather = await getWeatherData(icao.toUpperCase(), {
            datetime: req.query.datetime,
        });
        res.json(weather);
    } catch (error) {
        console.error(`Error in /api/weather/${icao}:`, error);
        if (error.message.includes('No METAR found') || error.message.includes('No FAA forecast data is available')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message || 'Failed to fetch weather data' });
        }
    }
});

// Legacy/Compatibility endpoint (Query Parameter)
app.get('/api/weather', async (req, res) => {
    const { icao } = req.query;
    if (!icao) return res.status(400).json({ error: 'ICAO code is required' });
    
    try {
        const weather = await getWeatherData(icao.toUpperCase(), {
            datetime: req.query.datetime,
        });
        res.json(weather);
    } catch (error) {
        console.error(`Error in /api/weather?icao=${icao}:`, error);
        res.status(error.message.includes('No METAR') || error.message.includes('No FAA forecast data is available') ? 404 : 500).json({ error: error.message || 'Failed to fetch weather data' });
    }
});

app.listen(PORT, () => {
    console.log(`OpenFlight AI server running at http://localhost:${PORT}`);
});
