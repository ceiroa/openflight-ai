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

To run the sample calculation:

```bash
node index.js
```

## Engineering Principles

OpenFlight-AI is built with a focus on precision and reliability. Our navigation engine uses the Law of Sines to provide exact trigonometric solutions for the wind triangle, a fundamental requirement for accurate cross-country navigation.

## License

This project is licensed under the MIT License.
