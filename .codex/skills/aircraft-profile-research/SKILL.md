---
name: aircraft-profile-research
description: Use when a contributor wants Codex to research a real aircraft's performance data from primary sources and create or update a JSON profile in this project's `src/data/aircraft/profiles/` folder using the local schema.
---

# Aircraft Profile Research

Create or update aircraft profile files for OpenFlight AI.

## Workflow

1. Read `src/data/aircraft/schema.md`.
2. Inspect one or two existing profiles in `src/data/aircraft/profiles/`.
3. Research the requested aircraft from primary sources when possible:
   - POH / AFM / flight manual
   - manufacturer documentation
   - engine documentation when aircraft-specific data is unavailable
4. Prefer documented values over inferred values.
5. If a field is unknown, use `null` and note the gap in `source_notes`.
6. Save the profile as a new JSON file in `src/data/aircraft/profiles/` using kebab-case `id`.
7. Do not silently overwrite a different aircraft's file.

## Required Output

- A valid JSON profile file in `src/data/aircraft/profiles/`
- `source_notes` summarizing where the values came from
- A short note listing any missing or uncertain fields

## Guardrails

- Do not invent climb table rows.
- Do not use forum posts or marketing summaries as the primary source when a manual exists.
- Keep units aligned with `schema.md`.
- If conflicting sources disagree, preserve the conflict in `source_notes` instead of guessing.
