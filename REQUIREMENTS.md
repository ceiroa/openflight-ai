# OpenFlight AI - Project Requirements & Specification

## 1. Core Vision
OpenFlight AI is a dark-themed flight planning and navigation log generator for GA pilots, with an initial focus on Light Sport Aircraft such as the Evektor Harmony LSA.

## 2. UI/UX Standards
- **Theme:** High-contrast dark mode using a slate/blue palette.
- **Aesthetics:**
    - A stylized flight-path canvas appears at the top of the page with a dashed route and aircraft icon.
    - Departure and destination legs are visually grouped and easy to scan.
    - The layout remains usable on smaller screens.
- **Interactivity:**
    - ICAO fields trigger automatic weather lookup on blur.
    - Weather population fills temperature, altimeter, wind speed, wind direction, airport elevation, latitude, and longitude.
    - The global cruise altitude updates all existing leg altitudes and is used as the default for newly added legs.
    - Users can dynamically add and remove destination legs, but at least one destination leg must remain.
    - A status banner displays validation and fetch failures.
    - A debug log window shows weather fetches and navigation log generation events.
    - Navigation log generation is blocked until required aircraft, weather, and coordinate inputs exist for every leg.

## 3. Data Sources & Logic
- **Weather and airport data:** Real-time data from `aviationweather.gov`.
    - Weather is fetched from the official METAR endpoint.
    - If METAR data does not contain usable coordinates or elevation, the app falls back to the official `stationinfo` endpoint and then the official `airport` endpoint.
    - Airport elevation is converted from meters to feet using `3.28084`.
- **Aircraft performance:**
    - Aircraft profiles are loaded from project data files such as `src/data/harmony_specs.json`.
    - Climb and cruise values are taken from the selected aircraft profile rather than hardcoded in the UI.
    - Climb profiles require a climb-performance table for interpolation.
- **Calculations:**
    - Pressure altitude is calculated from airport or planned altitude and the current altimeter setting.
    - Density altitude is calculated from pressure altitude and outside air temperature.
    - Climb performance is interpolated from the aircraft climb table.
    - Wind triangle calculations determine wind correction angle, groundspeed, and headings.
    - Great-circle distance and bearing are derived from airport coordinates.
    - Magnetic heading currently uses variation fields that default to `0`; automatic magnetic variation lookup is not implemented yet.

## 4. Navigation Log Output
### Table 1: Cruise Performance
- **Columns:** POINT, ALTITUDE, P. ALT, OAT, D. ALT, % BHP, RPM, KTAS, FUEL (GPH).
- **Rows:**
    - The departure airport always produces an initial airport row.
    - Each leg adds a cruise row for the destination.
    - Each leg after the first also adds an airport row for the previous destination.
    - Example: `KORD -> KARR -> KVYS` produces four rows in Table 1.

### Table 2: Course & Wind
- **Columns:** LEG SEGMENT, TRUE COURSE, WIND (DIR/SPD), TRUE HDG, VAR, MAG HDG, GS, DIST, ETE, FUEL BURN.
- **Rows:**
    - Every leg produces one cruise row: `TOC-destination`.
    - A climb row: `start-TOC` is only added when the planned altitude is above the previous airport elevation.
    - Climb rows use the previous point's surface winds.
    - Cruise rows use the destination leg's weather values.

### Table 3: Checkpoints & Comms
- **Columns:** CHECKPOINT, MAG HDG, DIST (LEG), DIST (REM), GROUNDSPEED, ETE, ETA, COMMS / FREQ.
- **Current behavior:**
    - One row is produced per destination checkpoint.
    - Remaining distance is tracked cumulatively.
    - `ETA` is currently a placeholder value of `-`.
    - `COMMS / FREQ` is currently a placeholder value of `CTAF`.

## 5. Validation Rules
- The aircraft profile must load successfully before the nav log can be generated.
- Departure ICAO and all destination ICAOs must be four characters.
- Departure weather and coordinates must be loaded before generation.
- Every destination leg must have weather and coordinates loaded before generation.
- Every planned leg altitude must be numeric and non-negative.

## 6. Test Workflow
- **Standard:** Behavior changes must be covered by automated tests.
- **Commands:**
    - `npm run test:unit` runs Jest unit tests for calculations and service logic.
    - `npm run test:ui` runs Playwright end-to-end tests.
    - `npm test` runs both suites and is the required pre-push check.
- **Coverage:**
    - `tests/unit` covers navigation calculations and weather-service fallback behavior.
    - `tests/e2e` covers theme rendering, flight graph visibility, automated weather population, leg addition/removal, and multi-destination navigation log generation with mocked weather responses.
- **CI:** GitHub Actions runs the same checks on pushes and pull requests.

## 7. Future Roadmap
- Add more aircraft profiles and profile-selection UX beyond the current data files.
- Add automatic magnetic variation lookup based on coordinates.
- Improve checkpoint communications and ETA generation from real data sources.
- Add explicit top-of-descent logic if descent planning becomes part of the nav log.
