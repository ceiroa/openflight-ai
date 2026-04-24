# OpenFlight AI - Project Requirements & Specification

## 1. Core Vision
OpenFlight AI is a stylized, dark-themed flight planning and navigation log generator designed for GA (General Aviation) pilots, specifically focusing on Light Sport Aircraft like the Evektor Harmony LSA.

## 2. UI/UX Standards
- **Theme:** High-contrast Dark Mode (Slate/Blue/Zinc palette).
- **Aesthetics:** 
    - Interactive "Flight Path" canvas at the top with a recognizable stylized airplane icon flying along a dashed path.
    - Responsive layout that fits well on smaller screens.
    - Distinct grouping for Departure and Destination legs with background contrast for field readability.
- **Interactivity:**
    - ICAO fields trigger automatic weather fetching on "blur" (tab out).
    - Weather data includes Temperature (°C), Altimeter (inHg), Wind Speed (kt), Wind Direction (°), and Airport Elevation (ft).
    - **Global Altitude Prepopulation:** Changing the 'Global Cruise Altitude' field automatically updates all existing leg altitudes. New legs default to this value.
    - Automatic conversion of hPa to inHg for altimeter settings (detect if > 50).
    - Dynamic addition/removal of destination legs.

## 3. Data Sources & Logic
- **Weather & Elevation:** Real-time data from `aviationweather.gov`.
    - **Airport Elevation:** Official field `elev` is provided in meters; converted automatically to feet using the 3.28084 multiplier.
- **Aircraft Performance:** 
    - Sourced from POH data (e.g., `src/data/harmony_specs.json`).
    - **Climb:** 100% BHP, 5500 RPM, 65 VY KTAS.
    - **Cruise:** 65% BHP, 4800 RPM, 93 KTAS (typical).
    - **Fuel:** Consumption rates mapped to BHP/RPM profiles.
- **Calculations:**
    - **Pressure Altitude:** Calculated from airport/planned altitude and current altimeter setting.
    - **Density Altitude:** Calculated from Pressure Altitude and OAT.
    - **TOC (Top of Climb):** Time = (Planned Alt - Airport Alt) / Climb Rate. Distance = Time * Climb Groundspeed.
    - **Wind Triangle:** Groundspeed and True Heading calculated via WCA (Wind Correction Angle).
    - **Magnetic Heading:** True Heading adjusted by local Magnetic Variation (sourced automatically).

## 4. Navigation Log Output (3 Tables)
### Table 1: Cruise Performance
- **Columns:** POINT/LEG, ALTITUDE, P. ALT, OAT, D. ALT, % BHP, RPM, KTAS, FUEL (GPH).
- **Rows:** 
    - **Airport Rows (APT):** Represent the climb phase from ground to TOC. Must populate with climb performance data: **100% BHP, 5500 RPM, 65 KTAS, 6.6 GPH**.
    - **Cruise Rows:** Represent level flight at planned altitude. Populate with cruise performance data: **65% BHP, 4800 RPM, 93 KTAS, 4.3 GPH**.

### Table 2: Course & Wind
- **Columns:** LEG SEGMENT, TRUE COURSE, WIND (DIR/SPD), TRUE HDG, VAR, MAG HDG, GS, DIST, ETE, FUEL BURN.
- **Logic:** Accounts for Top of Climb adjustments.

### Table 3: Checkpoints & Comms
- **Columns:** CHECKPOINT, MAG HDG, DIST (LEG), DIST (REM), GROUNDSPEED, ETE, ETA, COMMS / FREQ.
- **Logic:** Tracks progress and remaining distance; includes frequencies (ATIS/CTAF).

## 5. Test-Driven UI Workflow
- **Standard:** All UI changes must be verified using the automated test suite.
- **Workflow:**
    1. Run `npm run test:ui` **BEFORE** making any UI changes to establish a baseline.
    2. Apply the requested changes.
    3. Run `npm run test:ui` **AFTER** changes to verify functionality.
    4. If any tests fail, the AI **MUST** ask the user if they want to revert the changes.
- **Coverage:** Automated tests in `tests/ui.test.js` cover dark theme colors, flight graph visibility, automated weather fetching, leg addition/removal, and navigation log generation.

## 6. Future Roadmap
- Integrate internet-sourced performance data for more common GA airplanes (Cessna, Piper, etc.).
- Enhanced Top of Climb / Top of Descent splitting in the nav log tables.
- Automatic Magnetic Variation lookup based on coordinates.
