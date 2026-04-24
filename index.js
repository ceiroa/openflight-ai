import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { getWeatherData } from './src/api/weatherService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const AIRCRAFT_FILES = {
    'Evektor Harmony LSA': 'harmony_specs.json',
    'Rotax 912': 'aircraft.json',
};

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get aircraft data
app.get('/api/aircraft', async (req, res) => {
    const { name } = req.query;
    try {
        const fileName = AIRCRAFT_FILES[name] ?? AIRCRAFT_FILES['Evektor Harmony LSA'];
        const data = await fs.readFile(path.join(__dirname, 'src', 'data', fileName), 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to load aircraft data' });
    }
});

// API endpoint to get weather data by ICAO (Path Parameter)
app.get('/api/weather/:icao', async (req, res) => {
    const { icao } = req.params;
    const { date, geomagApiKey } = req.query;
    try {
        const weather = await getWeatherData(icao.toUpperCase(), date, geomagApiKey);
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
    const { icao, date, geomagApiKey } = req.query;
    if (!icao) return res.status(400).json({ error: 'ICAO code is required' });
    
    try {
        const weather = await getWeatherData(icao.toUpperCase(), date, geomagApiKey);
        res.json(weather);
    } catch (error) {
        console.error(`Error in /api/weather?icao=${icao}:`, error);
        res.status(error.message.includes('No METAR') ? 404 : 500).json({ error: error.message || 'Failed to fetch weather data' });
    }
});

app.listen(PORT, () => {
    console.log(`OpenFlight AI server running at http://localhost:${PORT}`);
});
