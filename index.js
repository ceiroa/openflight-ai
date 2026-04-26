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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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

// API endpoint to get weather data by ICAO (Path Parameter)
app.get('/api/weather/:icao', async (req, res) => {
    const { icao } = req.params;
    try {
        const weather = await getWeatherData(icao.toUpperCase());
        res.json(weather);
    } catch (error) {
        console.error(`Error in /api/weather/${icao}:`, error);
        if (error.message.includes('No METAR found')) {
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
        const weather = await getWeatherData(icao.toUpperCase());
        res.json(weather);
    } catch (error) {
        console.error(`Error in /api/weather?icao=${icao}:`, error);
        res.status(error.message.includes('No METAR') ? 404 : 500).json({ error: error.message || 'Failed to fetch weather data' });
    }
});

app.listen(PORT, () => {
    console.log(`OpenFlight AI server running at http://localhost:${PORT}`);
});
