# Aircraft Profile Schema

Profiles live in `src/data/aircraft/profiles/*.json`.

Each file uses this shape:

```json
{
  "schema_version": 1,
  "id": "evektor-harmony-lsa",
  "aircraft": "Evektor Harmony LSA",
  "manufacturer": "Evektor",
  "model": "Harmony LSA",
  "engine": "Rotax 912 ULS",
  "source_notes": "Short notes about where the numbers came from.",
  "profiles": {
    "climb": {
      "speed_kts": 65,
      "rpm": 5500,
      "fuel_burn_gph": 6.6,
      "rate_of_climb_fpm": 850,
      "climbTable": [
        { "altitude_ft": 0, "speed_kts": 67, "rate_of_climb_fpm": 900 }
      ]
    },
    "cruise65": {
      "speed_kts": 93,
      "rpm": 4800,
      "fuel_burn_gph": 4.3
    }
  },
  "limits": {
    "vne_kts": 146,
    "vs_kts": 45,
    "max_rpm": 5500
  }
}
```

Required for a complete profile:

- `id`
- `aircraft`
- `profiles.climb`
- `profiles.climb.climbTable`
- `profiles.cruise65` or `profiles.cruise`

Conventions:

- `id` should be lowercase kebab-case
- speeds are in knots
- fuel burn is in gallons per hour
- climb table altitude is in feet
- if a value is unknown, use `null` rather than inventing a number
