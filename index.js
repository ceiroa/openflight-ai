import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { getWeatherData } from './src/api/weatherService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get aircraft data
app.get('/api/aircraft', async (req, res) => {
    const { name } = req.query;
    try {
        let fileName = 'harmony_specs.json'; // Default
        if (name === 'Rotax 912') fileName = 'aircraft.json';
        
        const data = await fs.readFile(path.join(__dirname, 'src', 'data', fileName), 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to load aircraft data' });
    }
});

// API endpoint to get weather data by ICAO (Path Parameter)
app.get('/api/weather/:icao', async (req, res) => {
    const { icao } = req.params;
    try {
        const weather = await getWeatherData(icao.toUpperCase());
        res.json(weather);
    } catch (error) {
        if (error.message.includes('No METAR found')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to fetch weather data' });
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
        res.status(error.message.includes('No METAR') ? 404 : 500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`OpenFlight AI server running at http://localhost:${PORT}`);
});
