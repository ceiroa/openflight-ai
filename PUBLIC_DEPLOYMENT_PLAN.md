# Public Deployment Plan

## Goal

Make the public CieloRumbo project accessible without requiring users to clone the repo and run it locally.

## Recommended Public Structure

- `cielorumbo.com`
  - marketing / landing page
  - docs
  - disclaimer
  - beta interest capture

- `app.cielorumbo.com`
  - live public web app

## Hosting Split

### Landing / docs site

Recommended host:

- GitHub Pages

Why:

- simple
- already aligned with the current `docs/` structure
- good fit for public docs, screenshots, and interest capture

### Live app

Recommended host:

- Render

Why:

- the app is dynamic and uses Node.js + Express
- Render supports Git-backed Express web services directly
- a Render Blueprint can live in this repo as `render.yaml`

Relevant files now present:

- `render.yaml`
- `/healthz` endpoint in `index.js`

## Render Service Baseline

Current blueprint assumptions:

- service name: `cielorumbo-app`
- runtime: `node`
- plan: `starter`
- region: `oregon`
- build command: `npm ci`
- start command: `npm start`
- health check path: `/healthz`

These can be adjusted later in the dashboard or by editing `render.yaml`.

## Domain Plan

### Public docs / marketing

- point apex domain or `www` to GitHub Pages
- examples:
  - `cielorumbo.com`
  - `www.cielorumbo.com`

### Live app

- point app subdomain to Render
- example:
  - `app.cielorumbo.com`

## Interest Capture

The current landing page is ready for a configurable interest form:

- `docs/site-config.js`
- `docs/beta-interest.js`

Two supported paths:

1. `interestFormUrl`
  - POST to a hosted form service

2. `interestEmail`
  - open the local mail client with the form payload

Recommended first path:

- use a hosted form endpoint

## Suggested Launch Order

1. publish the landing/docs site
2. choose and wire the interest form provider
3. connect the repo to Render
4. deploy the live app
5. add the real `Open App` CTA to the landing page
6. add analytics

## Minimal Analytics Later

Do not block launch on analytics.

Later options:

- simple privacy-friendly site analytics on the landing page
- Render request/activity monitoring for app traffic
- lightweight event tracking for:
  - landing-page visits
  - beta-interest submissions
  - app opens
  - nav-log generations

## Current Recommendation

The best next public-launch sequence is:

1. push `render.yaml` and deployment prep
2. publish `docs/` as the marketing site
3. choose a form provider
4. connect Render and deploy the app
