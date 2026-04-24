# OpenFlight-AI

OpenFlight-AI is a sophisticated tool designed to assist pilots in VFR (Visual Flight Rules) cross-country planning. By leveraging modern computational logic, it simplifies complex navigational calculations, ensuring safer and more efficient flight preparation.

## Features

- **Wind Correction Angle (WCA) Calculation:** Determine the necessary heading correction to maintain a desired course under varying wind conditions.
- **Groundspeed Estimation:** Calculate accurate groundspeed based on cruise performance and ambient wind vectors.
- **Automated Planning:** (Future) Intelligent route optimization and fuel planning.

## Getting Started

### Prerequisites

- Node.js (v14 or higher recommended)

### Installation

```bash
npm install
```

### Usage

To run the local app:

```bash
npm start
```

### Tests

Run the full safety check before committing:

```bash
npm test
```

You can also run the suites separately:

```bash
npm run test:unit
npm run test:ui
```

## Engineering Principles

OpenFlight-AI is built with a focus on precision and reliability. Our navigation engine uses the Law of Sines to provide exact trigonometric solutions for the wind triangle, a fundamental requirement for accurate cross-country navigation.

## Change Workflow

To keep future AI-generated edits from breaking the app:

1. Keep calculation logic in `public/js/navigation.js`.
2. Keep UI orchestration in `public/js/app.js`.
3. Keep aircraft performance data in `src/data/*.json`.
4. Keep server-side weather normalization in `src/api/weatherService.js`.
5. Run `npm test` after every change before pushing.
6. Prefer adding or updating tests in the same change that modifies behavior.

The repository CI workflow runs the same checks on GitHub for every push and pull request.

## License

This project is licensed under the MIT License.
