# Backend Architecture

## Overview

PolyOracle is an arbitrage detection system that identifies price discrepancies between two prediction markets: **Polymarket** (crypto-based) and **Kalshi** (regulated). The backend scans both platforms, matches equivalent markets, and calculates exploitable spreads.

## Directory Structure

```
src/
├── api/                    # HTTP API layer
│   ├── server.ts           # Express server setup
│   ├── routes/             # API route handlers
│   ├── processors/         # Response transformers (DTOs)
│   └── services/           # Business logic orchestration
│
├── connectors/             # External API integrations
│   ├── polymarket-connector.ts
│   └── kalshi-connector.ts
│
├── matching/               # Market matching logic
│   ├── catalog-matcher.ts  # Event-level matching from config
│   ├── market-matcher.ts   # Market-level matching within events
│   ├── nba-game-matcher.ts # NBA schedule integration
│   ├── nba-market-matcher.ts
│   ├── normalizers/        # Team name normalization
│   ├── polymarket/         # Slug generation
│   └── kalshi/             # Ticker generation
│
├── arbitrage/              # Arbitrage calculations
│   ├── calculator.ts       # Spread & profit calculations
│   └── liquidity-analyzer.ts
│
├── orderbook/              # Order book fetching
│   ├── fetcher.ts          # Unified interface
│   ├── types.ts            # Order book types
│   ├── polymarket/         # CLOB API integration
│   └── kalshi/             # Kalshi order book API
│
├── config/                 # Configuration
│   ├── api.ts              # API endpoints & settings
│   └── market-mappings.json
│
├── helpers/                # Shared utilities
│   └── helpers.ts          # Retry logic, sleep
│
├── types/                  # TypeScript type definitions
└── errors/                 # Error handling
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              API Request                                │
│                         GET /api/opportunities                          │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Scanner Service                                │
│                     (scanner.service.ts)                                │
│  - Orchestrates full scan pipeline                                      │
│  - Manages 60s result cache                                             │
│  - Prevents concurrent scans (lock mechanism)                           │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
┌─────────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│  Yearly Events      │ │  Dynamic Events │ │   NBA Games         │
│  (sports champions) │ │  (daily weather)│ │   (live schedule)   │
└──────────┬──────────┘ └────────┬────────┘ └──────────┬──────────┘
           │                     │                     │
           └─────────────────────┼─────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Connectors                                    │
│  ┌─────────────────────────┐    ┌─────────────────────────────────┐    │
│  │  Polymarket Connector   │    │      Kalshi Connector           │    │
│  │  - Gamma API (events)   │    │  - TypeScript SDK               │    │
│  │  - CLOB API (orderbook) │    │  - getEvents() with nested mkts │    │
│  └─────────────────────────┘    └─────────────────────────────────┘    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Market Matcher                                 │
│  - Matches markets by category (sports, weather, finance)              │
│  - Normalizes team names, temperature ranges, Fed actions              │
│  - Produces MarketPair objects with prices from both platforms         │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Arbitrage Calculator                              │
│  - Identifies guaranteed arbs (cost < $1)                              │
│  - Calculates spread percentages                                        │
│  - Sorts by profit potential                                            │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Liquidity Analyzer                                │
│  - Fetches order books from both platforms                             │
│  - Walks order book depth to find executable size                      │
│  - Calculates max investment & profit at each price level              │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Opportunity Processor                              │
│  - Transforms internal models to API DTOs                              │
│  - Adds URLs, ROI, APR calculations                                    │
│  - Returns JSON response                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Connectors (`src/connectors/`)

Platform-specific API integrations.

**Polymarket Connector:**
- Uses Gamma API for event/market discovery
- Uses CLOB API for order book data
- Markets return JSON-encoded price arrays

**Kalshi Connector:**
- Uses official TypeScript SDK (`kalshi-typescript`)
- Single call with `withNestedMarkets=true` fetches events + markets
- Implements `withRetry()` for rate limit handling

### 2. Matching System (`src/matching/`)

Two-phase matching:

1. **Event Matching** (`catalog-matcher.ts`):
   - Reads `market-mappings.json` config
   - Generates Polymarket slugs and Kalshi tickers
   - Supports static (yearly) and dynamic (daily) patterns

2. **Market Matching** (`market-matcher.ts`):
   - Matches individual outcomes within events
   - Category-specific logic:
     - **Sports**: Team name normalization
     - **Weather**: Temperature range parsing
     - **Finance**: Fed action parsing (cut/raise/hold)

### 3. Arbitrage Engine (`src/arbitrage/`)

**Calculator:**
- Guaranteed arbitrage: Buy YES on one + NO on other < $1
- Spread arbitrage: Directional bet on price difference
- Minimum 2% spread threshold for reporting

**Liquidity Analyzer:**
- Walks both order books simultaneously
- Finds maximum executable size before spread exhausts
- Reports limiting factor (platform liquidity or spread closure)

### 4. API Layer (`src/api/`)

- **Routes**: Simple Express handlers
- **Processors**: Transform scan results to DTOs
- **Services**: Business logic and caching

## Configuration

### API Settings (`src/config/api.ts`)

```typescript
POLYMARKET = {
  GAMMA_API_URL: 'https://gamma-api.polymarket.com',
  CLOB_API_URL: 'https://clob.polymarket.com',
}

KALSHI = {
  API_URL: 'https://api.elections.kalshi.com/trade-api/v2',
}

SCANNER = {
  DYNAMIC_SCAN_DAYS: 3,      // Days ahead to scan
  RATE_LIMIT_DELAY_MS: 50,   // Delay between calls
}
```

### Market Mappings (`config/market-mappings.json`)

Defines how to match events between platforms:

```json
{
  "static": [
    {
      "name": "Super Bowl Winner",
      "category": "sports",
      "polymarket": "super-bowl-lix-winner",
      "kalshi": "KXSUPERBOWL-25"
    }
  ],
  "dynamic": [
    {
      "name": "NYC High Temperature",
      "category": "weather",
      "frequency": "daily",
      "polymarket": { "pattern": "nyc-high-temp-{MMM}-{D}-{YYYY}" },
      "kalshi": { "series": "HIGHNY", "pattern": "HIGHNY-{YY}{MMM}{DD}" }
    }
  ]
}
```

## Caching Strategy

1. **Scan Result Cache** (60s TTL):
   - Full scan results cached in memory
   - Prevents redundant API calls for rapid requests

2. **Scan Lock**:
   - Only one scan runs at a time
   - Subsequent requests wait for in-progress scan

3. **Per-Scan Caches**:
   - NBA markets fetched once per scan
   - Filtered locally for each game

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/opportunities` | GET | List arbitrage opportunities |
| `/api/opportunities?refresh=true` | GET | Force fresh scan |

## Response Format

```typescript
{
  opportunities: [{
    id: string,
    eventName: string,
    marketName: string,
    category: string,
    type: 'guaranteed' | 'spread',
    spreadPct: number,
    prices: {
      polymarket: { yes, no },
      kalshi: { yes, no },
      orderBook: { polyYesAsk, kalshiNoAsk, totalCost, profitPct } | null
    },
    liquidity: { status, limitedBy },
    potentialProfit: number,
    maxInvestment: number,
    roi: number | null,
    apr: number | null,
    urls: { polymarket, kalshi },
    timeToResolution: string | null
  }],
  meta: {
    totalCount: number,
    scannedAt: string
  }
}
```

## Rate Limiting

Both platforms have rate limits. Handled via:

1. **Retry with Exponential Backoff** (`helpers.ts`):
   - 3 retries on 429 responses
   - Delays: 100ms, 200ms, 400ms

2. **Request Strategy**:
   - Polymarket: Parallel requests (permissive limits)
   - Kalshi: Sequential with SDK (connection-limited)

## Error Handling

- Individual market fetch failures are logged but don't fail the scan
- Missing markets return `null` and are filtered out
- HTTP errors include status codes in logs
