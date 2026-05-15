# CieloRumbo

CieloRumbo is an experimental browser-first VFR planning tool for pilots and students. It helps build cross-country nav logs, review route weather, generate visual checkpoints, inspect FAA airspace, and open current FAA airport diagrams from one workflow.

## Disclaimer

This project is provided for educational purposes only. Do not rely exclusively on it for real-world navigation planning, weather evaluation, chart review, or flight decision-making. Always use official aeronautical charts, current weather briefings, approved flight-planning tools, and your own pilot judgment.

## Current Beta Features

- Multi-leg VFR flight setup with aircraft profile selection and per-leg planned altitudes.
- Weather-aware nav-log generation using AviationWeather METARs and TAFs.
- Future-date forecast handling, including nearby TAF fallback when an airport has METAR but no direct TAF.
- Route map with checkpoints, airport weather markers, current-location/recenter controls, FAA airspace, terrain, and sectional-reference modes.
- Checkpoints planner with editable route checkpoints, visual/airport/category badges, and saved checkpoint reuse.
- Airspace profile page showing route altitude, terrain, Class B/C/D/E/G controls, and selectable airspace classes.
- Airport Briefs page that loads current FAA d-TPP airport diagrams by URL instead of storing chart PDFs in the repo.
- Editable aircraft profiles with climb tables used for density-altitude-aware climb calculations.
- Save/load plan files that intentionally exclude live weather so weather is refreshed after loading.

## Known Limitations

- CieloRumbo is not a certified EFB and is not suitable as a sole source for flight planning.
- FAA, AviationWeather, USGS, OpenStreetMap, and other external services can be unavailable or change formats.
- Not every airport has a published FAA airport diagram or TAF; the app shows unavailable states or nearby forecast-source labels when appropriate.
- Airspace and terrain views are planning aids and must be checked against current official FAA charts and publications.
- Aircraft profiles are seed planning profiles and should be verified against the exact aircraft POH/AFM.

## Getting Started

### Prerequisites

- Node.js 20 or newer recommended

### Installation

```bash
npm install
```

### Local Development

```bash
npm start
```

Open `http://localhost:3000`.

### Tests

Run the full check before pushing significant changes:

```bash
npm test
```

Useful focused suites:

```bash
npm run test:unit
npm run test:ui:home
npm run test:ui:map
npm run test:ui:planner
npm run test:ui:airspace
npm run test:ui:smoke
```

## Data Sources

- AviationWeather.gov for METAR, TAF, station, and airport weather data.
- FAA airspace services for class-airspace map/profile geometry and vertical limits.
- FAA d-TPP metadata for current airport diagram PDF links.
- FAA chart metadata for sectional/TAC reference workflows.
- USGS elevation service for terrain samples.
- OpenStreetMap/OpenTopoMap for base-map and terrain context.
- Local `magvar` calculations for magnetic variation.
- Repository aircraft profile JSON files for aircraft performance assumptions.

See `docs/data-sources.html` for the public data-source reference page.

## Engineering Notes

To keep future changes stable:

1. Keep calculation logic in `public/js/navigation.js`.
2. Keep home-page orchestration in `public/js/app.js`.
3. Keep server-side weather normalization in `src/api/weatherService.js`.
4. Keep airport diagram lookup in `src/api/airportDiagramService.js`.
5. Keep aircraft profile data in `src/data/aircraft/profiles/*.json`.
6. Add or update tests in the same change that modifies behavior.
7. Run an appropriate focused test suite for small changes and `npm test` for release-level changes.

## GitHub Pages

The public landing/docs site lives under `docs/`.

To publish with GitHub Pages:

1. Open the repository on GitHub.
2. Go to `Settings` -> `Pages`.
3. Under `Build and deployment`, choose `Deploy from a branch`.
4. Select branch `main` and folder `/docs`.
5. Save the setting.

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

The public repository is intended to remain the open core of CieloRumbo. A separate private iPhone/iPad app repository may build on top of this public project for native packaging, premium features, and Apple-specific commercial work.
