# CieloRumbo Mobile App Plan

## Goal
Turn CieloRumbo into a usable iPad/iPhone app without rewriting the product from scratch.

## Recommendation
Use a staged path:
1. Responsive mobile/tablet web app
2. PWA support
3. Mobile-specific workflow polish
4. Capacitor packaging for iPad/iPhone

Do not start with a React Native or full native rewrite.

## Why This Path
- The current app is already browser-based and map-centric.
- Most core workflows already exist.
- A rewrite would add risk without adding much near-term value.
- PWA-first and Capacitor-next preserve momentum and reduce churn.

## Product Principles
- iPad is the primary target first.
- iPhone should be usable, especially for the map and quick review flows.
- The map page should become the main mobile operational surface.
- The app remains educational/experimental and non-certified.

## Current Strengths
- Existing multi-page app shell
- Route map workflow
- Airspace overlay and profile page
- Checkpoints planner
- Aircraft profiles
- Local browser persistence
- JSON save/load plan support
- Current location support started

## Main Gaps Before Packaging
- Mobile-responsive layouts across all pages
- Better touch-first controls and spacing
- App-shell installability
- Clear offline/online behavior
- Stronger mobile geolocation flow
- Local saved-plan UX beyond a single browser draft

## Phase 1: Responsive UI
### Priority
1. Route Map
2. Flight Setup
3. Checkpoints Planner
4. Airspace Profile
5. Aircraft Profiles

### Route Map
- Default to map-first layout on narrow screens
- Keep side panel collapsed by default
- Keep only essential in-map controls visible
- Ensure weather, airspace, and route icons remain legible on iPad and iPhone
- Preserve fullscreen/focus mode behavior

### Flight Setup
- Stack fields cleanly on narrow widths
- Keep main actions easy to reach
- Make nav log view horizontally scrollable where needed
- Reduce visual density without hiding key planning inputs

### Checkpoints Planner
- Switch from wide row editing to stacked card layout on narrow screens
- Keep regenerate/save actions visible
- Preserve planner-to-map/home workflow

### Airspace Profile
- Preserve horizontal scroll intentionally
- Make surrounding controls and summaries compact
- Ensure profile remains usable on iPad portrait

### Aircraft Profiles
- Improve card/list spacing for touch use
- Keep navigation consistent with the other pages

## Phase 2: PWA
### Add
- `manifest.webmanifest`
- App icons
- Theme color and Apple mobile meta tags
- Service worker for app-shell caching

### Expected Outcome
- Installable from Safari
- Faster startup
- Better home-screen experience on iPad/iPhone

### Important Rule
Cache the app shell and static assets, but do not imply that live FAA/weather data is offline unless we explicitly support that.

## Phase 3: Mobile-Specific Workflow
- Improve geolocation permission and error handling
- Add optional follow-my-position mode
- Improve recenter/focus behavior for in-flight use
- Make panel open/close behavior smoother for smaller screens
- Add clearer connectivity messaging for weather/FAA-dependent features

## Phase 4: Local Saved Plans
### Add First-Class In-App Plan Persistence
- Autosaved current draft
- Named saved plans stored locally
- Continue supporting JSON import/export

### Persist
- Route/setup data
- Aircraft selection
- Planned altitudes
- Checkpoint plan and edits
- Map/planner state where useful

### Do Not Persist As Current Truth
- Live weather as authoritative operational data

Weather may still be short-term cached for convenience, but it should be refreshed when reopening/loading.

## Phase 5: Capacitor Packaging
### Why
- Better iPhone/iPad app experience
- Native packaging
- More reliable permission handling
- Better long-term path for device integration

### Scope
- App icon and splash
- Native shell
- Geolocation permission flow
- Build/install/test on iPad/iPhone

## Not Recommended Right Now
- Full React Native rewrite
- Native iOS rewrite
- App Store work before tablet/mobile UX is good in the browser

## Risks
- Mobile layout regressions on desktop if CSS changes are too broad
- Overcomplicating the map UI on small screens
- Confusion around offline capability if caching is not communicated clearly
- Packaging too early before the browser experience is stable

## Success Criteria
- iPad planning workflow is comfortable in portrait and landscape
- iPhone route-map workflow is practical
- App is installable
- Current location and route awareness feel natural on mobile
- Existing desktop functionality remains stable

## Proposed Implementation Order
1. Responsive Route Map
2. Responsive Flight Setup
3. Responsive Checkpoints Planner
4. Responsive Airspace Profile
5. PWA manifest + service worker
6. Local named saved plans
7. Mobile geolocation/follow-mode polish
8. Capacitor packaging

## Decisions Already Made
- PWA-first, Capacitor-next
- No rewrite-first approach
- iPad-first, then iPhone refinement
- Map page is the primary mobile surface

## Open Questions
- How much offline capability do we eventually want?
- Do we want a dedicated reduced “in-flight mode” screen later?
- Do we want named plan management before or after PWA support?
- Is App Store distribution an actual goal, or is private/device install enough?

