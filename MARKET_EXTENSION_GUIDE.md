# Market Extension Guide

How to add new events to the arbitrage scanner.

---

## Overview

The scanner uses `config/market-mappings.json` to match events between Polymarket and Kalshi. There are two mapping types:

| Type | Use Case | Example |
|------|----------|---------|
| **Static** | One-off events with fixed URLs | Presidential election, specific event |
| **Dynamic** | Recurring events with date patterns | Daily weather, yearly championships |

---

## Finding Market Identifiers

Before adding a mapping, find the identifiers on both platforms:

### Polymarket

1. Go to [polymarket.com](https://polymarket.com)
2. Find the event/market
3. Extract the **slug** from the URL:
   ```
   https://polymarket.com/event/2026-nba-champion
                                  ^^^^^^^^^^^^^^^^
                                  This is the slug
   ```

### Kalshi

1. Go to [kalshi.com](https://kalshi.com)
2. Find the market
3. Extract the **ticker** and **series**:
   ```
   Ticker: KXNBA-26      (shown on market page)
   Series: KXNBA         (ticker without date suffix)
   ```

---

## Adding Static Mappings

Use static mappings for one-time events that don't repeat with a predictable pattern.

### Format

```json
{
  "static": [
    {
      "name": "Human-readable name",
      "category": "politics|sports|entertainment|other",
      "polymarket": "polymarket-event-slug",
      "kalshi": "KALSHI-TICKER",
      "kalshiSeries": "KALSHI"
    }
  ]
}
```

### Example: Adding a Presidential Election

```json
{
  "name": "2028 Presidential Election",
  "category": "politics",
  "polymarket": "2028-presidential-election-winner",
  "kalshi": "KXPRES-28",
  "kalshiSeries": "KXPRES"
}
```

---

## Adding Dynamic Mappings

Use dynamic mappings for recurring events where dates are embedded in the URL/ticker.

### Format

```json
{
  "dynamic": [
    {
      "name": "Event Name",
      "category": "sports|weather|finance|other",
      "frequency": "daily|monthly|yearly",
      "polymarket": {
        "pattern": "slug-with-{placeholders}",
        "example": "actual-example-slug"
      },
      "kalshi": {
        "series": "KXSERIES",
        "pattern": "KXSERIES-{yy}",
        "example": "KXSERIES-26"
      }
    }
  ]
}
```

### Available Placeholders

| Placeholder | Platform | Description | Example |
|-------------|----------|-------------|---------|
| `{year}` | Polymarket | 4-digit year | `2026` |
| `{month}` | Polymarket | Full month name (lowercase) | `january` |
| `{day}` | Polymarket | Day without padding | `5` |
| `{yy}` | Kalshi | 2-digit year | `26` |
| `{MON}` | Kalshi | 3-letter month (uppercase) | `JAN` |
| `{dd}` | Kalshi | 2-digit day | `05` |

### Example: Adding a Yearly Sports Event

```json
{
  "name": "MLS Cup",
  "category": "sports",
  "frequency": "yearly",
  "polymarket": {
    "pattern": "{year}-mls-cup-winner",
    "example": "2026-mls-cup-winner"
  },
  "kalshi": {
    "series": "KXMLS",
    "pattern": "KXMLS-{yy}",
    "example": "KXMLS-26"
  }
}
```

### Example: Adding a Daily Event

```json
{
  "name": "Seattle High Temperature",
  "category": "weather",
  "frequency": "daily",
  "polymarket": {
    "pattern": "highest-temperature-in-seattle-on-{month}-{day}",
    "example": "highest-temperature-in-seattle-on-january-15"
  },
  "kalshi": {
    "series": "KXHIGHSEA",
    "pattern": "KXHIGHSEA-{yy}{MON}{dd}",
    "example": "KXHIGHSEA-26JAN15"
  }
}
```

### Example: Adding a Monthly Event

```json
{
  "name": "CPI Report",
  "category": "finance",
  "frequency": "monthly",
  "polymarket": {
    "pattern": "cpi-report-{month}-{year}",
    "example": "cpi-report-january-2026"
  },
  "kalshi": {
    "series": "KXCPI",
    "pattern": "KXCPI-{yy}{MON}",
    "example": "KXCPI-26JAN"
  }
}
```

---

## Categories

Categories control how markets are matched within events:

| Category | Matching Strategy |
|----------|-------------------|
| `sports` | Team name extraction and normalization |
| `weather` | Temperature range parsing |
| `finance` | Action parsing (rate hike/cut/hold) |
| `politics` | Entity extraction |
| `other` | Basic text matching |

For **sports** markets, you may also need to add team aliases to `config/teams.json` if the team names differ between platforms.

---

## Adding Team Aliases (Sports Only)

If Polymarket and Kalshi use different names for the same team:

**File:** `config/teams.json`

```json
{
  "nba": {
    "thunder": ["oklahoma city thunder", "okc thunder", "okc"],
    "lakers": ["los angeles lakers", "la lakers"]
  },
  "nfl": {
    "49ers": ["san francisco 49ers", "sf 49ers", "niners"]
  }
}
```

---

## Testing Your Mapping

After adding a mapping, run the scanner to verify:

```bash
npx tsx src/scripts/find-matched-markets.ts
```

Look for your event in the output:
- `✓ Both (N pairs)` - Found on both platforms with N matched markets
- `○ Poly only` - Only found on Polymarket
- `○ Kalshi only` - Only found on Kalshi
- `✗ Neither` - Not found (check your slugs/tickers)

---

## Troubleshooting

### "Not found" on one platform

1. Verify the slug/ticker exists on that platform
2. Check for typos in the pattern
3. Ensure the event is active (not expired)

### "0 pairs" matched

1. For sports: Check if team names need aliases in `config/teams.json`
2. Verify both platforms have the same sub-markets (same teams/options)

### Pattern not generating correctly

1. Compare your pattern's output with the actual URL
2. Check placeholder spelling (`{year}` not `{Year}`)
3. Verify the `example` field matches a real URL

---

## Quick Reference

```json
// Static mapping template
{
  "name": "",
  "category": "",
  "polymarket": "",
  "kalshi": "",
  "kalshiSeries": ""
}

// Dynamic mapping template
{
  "name": "",
  "category": "",
  "frequency": "daily|monthly|yearly",
  "polymarket": {
    "pattern": "",
    "example": ""
  },
  "kalshi": {
    "series": "",
    "pattern": "",
    "example": ""
  }
}
```
