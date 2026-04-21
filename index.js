import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get pre-flighted aircraft data
app.get('/api/aircraft', async (req, res) => {
    try {
        const data = await fs.readFile(path.join(__dirname, 'src', 'data', 'harmony_specs.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to load aircraft data' });
    }
});

// API endpoint to get weather data
app.get('/api/weather', async (req, res) => {
    const { icao } = req.query;
    if (!icao) return res.status(400).json({ error: 'ICAO code is required' });

    const url = `https://www.aviationweather.gov/api/data/metar?ids=${icao}&format=json`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Weather data not available');
        
        const data = await response.json();
        if (!data || data.length === 0) return res.status(404).json({ error: 'No METAR found' });
        
        const metar = data[0];
        res.json({
            temperature: metar.temp,
            altimeter: metar.altim
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch weather data' });
    }
});

app.listen(PORT, () => {
    console.log(`OpenFlight AI server running at http://localhost:${PORT}`);
});
