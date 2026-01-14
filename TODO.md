# TODO.md - PolyOracle Arbitrage Scanner

## Overview
Build a prediction market arbitrage scanner that detects ROI-positive opportunities between Polymarket and Kalshi.

**Configuration:**
- Minimum ROI threshold: 1% after fees
- Update method: REST polling (30-60s intervals)
- Fee estimates: ~2% Polymarket, ~1% Kalshi

---

## Stage 1: API Exploration (COMPLETED)

### Phase 1a: Polymarket
- [x] Set up project (`npm init`, `tsconfig.json`, dependencies)
- [x] Create `src/types/polymarket.ts` with TypeScript interfaces
- [x] Build `src/scripts/polymarket-explorer.ts` to fetch events, markets, order books
- [x] Document Polymarket data model

**Polymarket Key Findings:**
- Events → Markets (1:many) → Outcomes (YES/NO)
- Prices are 0-1 decimals
- Two APIs: Gamma (discovery) + CLOB (trading)

### Phase 1b: Kalshi
- [x] Build `src/scripts/kalshi-explorer.ts`
- [x] **Upgraded to official TypeScript SDK** (`kalshi-typescript`)
- [x] Document Kalshi data model

**Kalshi Key Findings:**
- Series → Events → Markets (binary outcomes)
- SDK provides prices as dollar strings (0-1 format)
- No auth needed for reads

---

## Stage 2: Unified Data Model (COMPLETED)

- [x] Design `src/types/unified.ts` with platform-agnostic types
- [x] Build `src/connectors/polymarket-connector.ts`
- [x] Build `src/connectors/kalshi-connector.ts` (uses SDK)
- [x] Pagination support for both platforms

**Market Coverage:**
| Platform | Events | Markets |
|----------|--------|---------|
| Polymarket | ~5,000 | ~21,000 |
| Kalshi | ~3,300 | ~21,400 |

---

## Stage 3: Event Matching (COMPLETED - REDESIGNED)

**Previous Approach (Deprecated):**
- Fuzzy text matching with Levenshtein/Jaccard similarity
- Blocking strategies for performance
- Match cache persistence

**Current Approach: Config-Driven Catalog Matching**
- [x] Create `config/market-mappings.json` - Central catalog of event mappings
- [x] Build `src/matching/catalog-matcher.ts` - Pattern-based matching
- [x] Support for static mappings (manual slug/ticker pairs)
- [x] Support for dynamic patterns with placeholders:
  - `{year}`, `{month}`, `{day}` for Polymarket slugs
  - `{yy}`, `{MON}`, `{dd}` for Kalshi tickers
- [x] Frequency types: `daily`, `monthly`, `yearly`
- [x] Series-based Kalshi fetching for proper API access

**Catalog Coverage:**
| Category | Type | Events |
|----------|------|--------|
| Sports | Yearly | Super Bowl, NBA, NHL, MLB, UEFA |
| Weather | Daily | NYC, Miami, LA, Chicago, Denver, Austin, Philadelphia |
| Finance | Monthly | Fed Decision |

**Run Event Matching:**
```bash
npx tsx src/scripts/find-matched-markets.ts
```

---

## Stage 4: Arbitrage Detection (COMPLETED)

### Market-Level Matching
- [x] Build `src/matching/market-matcher.ts` - Match individual markets within events
- [x] Build `src/matching/normalizers/sports.ts` - Team name normalization
- [x] Create `config/teams.json` - Team aliases (NFL, NBA, NHL, MLB, Soccer)
- [x] Category-specific matching strategies:
  - **Sports**: Entity extraction (team names)
  - **Weather**: Temperature range parsing
  - **Finance**: Fed action parsing

### Arbitrage Calculator
- [x] Build `src/arbitrage/calculator.ts`
- [x] Detect guaranteed arbitrage (YES + NO < $1)
- [x] Detect simple spread arbitrage (>2% spread)
- [x] Sort opportunities by profit potential

**Results (Sample Run):**
```
Total market pairs matched: 71
Arbitrage opportunities: 71
  - Guaranteed profit: 71
  - Max spread: 3.7%
  - Avg spread: 0.8%
```

**Top Opportunities Found:**
| Market | Spread | Type |
|--------|--------|------|
| San Antonio Spurs (NBA) | 3.7% | Guaranteed |
| Colorado Avalanche (NHL) | 2.8% | Guaranteed |
| Carolina Hurricanes (NHL) | 2.5% | Guaranteed |
| OKC Thunder (NBA) | 2.5% | Guaranteed |

---

## Stage 4b: Weather Market Analysis (INVESTIGATED - NOT ARBITRAGEABLE)

**Finding:** Polymarket and Kalshi use systematically different temperature boundaries (1°F offset).

**Example:**
```
Polymarket: ≥48°F (covers 48, 49, 50...)
Kalshi:     ≥47°F (covers 47, 48, 49, 50...)
```

**Range Comparison:**
```
Temperature:  37   38   39   40   41   42   43   44   45   46   47
Polymarket:        [38-39] [40-41] [42-43] [44-45] [46-47]
Kalshi:       [≤38    ][39-40][41-42][43-44][45-46]
```

**Conclusion:** No risk-free arbitrage possible - ranges overlap but don't align.
The 1°F gap (e.g., temp = 47°F) would cause losses on both positions.

Weather markets remain in catalog for monitoring but produce 0 matched pairs.

---

## Stage 4c: Order Book Liquidity Analyzer (COMPLETED)

**Problem:** Current arbitrage detection uses midpoint prices but doesn't answer: "How much money can I deploy before the spread disappears?"

### Order Book Fetching
- [x] Create `src/orderbook/fetcher.ts` - Unified order book interface
  - [x] `fetchPolymarketOrderBook(yesTokenId, noTokenId)` - CLOB API
  - [x] `fetchKalshiOrderBook(ticker)` - Direct API
  - [x] Normalize to common `UnifiedOrderBook` format

### Liquidity Analysis
- [x] Create `src/arbitrage/liquidity-analyzer.ts`
  - [x] Walk through order book levels from both sides
  - [x] Calculate max contracts before spread exhausts
  - [x] Track cumulative cost and profit at each level
  - [x] Configurable fee handling

### Data Requirements
- [x] Modify `MarketPair` to include:
  - Polymarket: `tokenIds` (YES/NO token IDs from clobTokenIds)
  - Kalshi: market `ticker`

### Results (Sample Run)
```
Liquidity Summary (Top 10)
  Opportunities with liquidity: 6/10
  Total deployable capital: $52,492.15
  Total potential profit: $946.79
  Average profit: 1.80%
  Opportunities >$100: 6
  Opportunities >$1000: 3
```

---

## Stage 4d: Last Trade vs Order Book Price Discovery (COMPLETED)

**Problem:** Many "arbitrage opportunities" showed "No liquidity available" despite having full order books on both platforms.

### Investigation

Created test scripts to trace through the full pipeline:
- `src/scripts/test-orderbook.ts` - Tests matching pipeline with order book fetching
- `src/scripts/debug-barcelona.ts` - Detailed comparison of last trade vs order book prices

### Key Finding: Price Discrepancy

The arbitrage calculator uses **last trade prices**, but actual execution uses **order book prices**. These can diverge significantly:

**Example: Barcelona (UEFA Champions League)**
```
                    Poly YES    Kalshi NO    Total Cost    Profit
Last Trade Prices:    10.0¢       88.0¢        98.0¢       +2.0%
Order Book Prices:    11.0¢       90.0¢       101.0¢       -1.0%
```

The "spread" shown (2.0%) is based on stale last trade prices. The actual order book has moved and there's no executable arbitrage.

### Solution: Spread Classification

Updated `LiquidityAnalysis` to distinguish between:

| `limitedBy` Value | Meaning |
|-------------------|---------|
| `no_liquidity` | Empty order book (no resting orders) |
| `spread_closed` | Has liquidity, but order book prices make arb unprofitable |
| `spread_exhausted` | Arb exists but depletes at higher price levels |
| `polymarket_liquidity` | Polymarket side runs out first |
| `kalshi_liquidity` | Kalshi side runs out first |

### Improved Output

Before:
```
🔥 GUARANTEED - barcelona [UEFA Champions League]
  Spread: 2.0%
  No liquidity available
```

After:
```
🔥 GUARANTEED - barcelona [UEFA Champions League]
  Spread: 2.0%
  Spread closed at order book prices
    Poly YES ask: 11.0¢ + Kalshi NO ask: 90.0¢ = 101.0¢
    Execution would lose 1.0%
    (Last trade prices showed profit, but order book has moved)
```

### Implications for Trading

1. **Last trade prices are unreliable** - Only use for initial screening
2. **Always check order books** - Real execution prices may differ significantly
3. **Spreads can close quickly** - Between last trade and current order book
4. **True arbitrage is rarer** - Many "opportunities" disappear at execution prices

---

## Stage 4e: Production Refactoring (COMPLETED)

**Goal:** Clean up codebase for production-quality readability, extensibility, and maintainability.

### New Modules Created

| File | Purpose |
|------|---------|
| `src/config/api.ts` | Centralized API constants, timeouts, thresholds |
| `src/types/index.ts` | Type re-exports for cleaner imports |
| `src/errors/index.ts` | Lightweight typed error classes |

### Configuration Constants (`src/config/api.ts`)

Replaced magic numbers throughout codebase with named constants:

```typescript
export const POLYMARKET = {
  GAMMA_API_URL: 'https://gamma-api.polymarket.com',
  CLOB_API_URL: 'https://clob.polymarket.com',
  BATCH_SIZE: 200,
  TIMEOUT_MS: 30_000,
} as const;

export const KALSHI = {
  API_URL: 'https://api.elections.kalshi.com/trade-api/v2',
  BATCH_SIZE: 200,
  TIMEOUT_MS: 30_000,
} as const;

export const SCANNER = {
  RATE_LIMIT_DELAY_MS: 100,
  DYNAMIC_SCAN_DAYS: 3,
  MAX_LIQUIDITY_ANALYSIS: 10,
  POLL_INTERVAL_MS: 60_000,
} as const;

export const DISPLAY = {
  SEPARATOR_WIDTH: 70,
  PREVIEW_LIMIT: 3,
  PRICE_LEVELS_PREVIEW: 3,
  PRICE_LEVELS_FULL: 5,
} as const;
```

### Typed Error Hierarchy (`src/errors/index.ts`)

```typescript
PredictionMarketError (base)
├── ApiError          // Platform API failures
├── DataValidationError // Parsing/validation issues
├── MatchingError     // Event/market matching problems
└── ArbitrageError    // Calculation errors
```

### Refactored Files

| File | Changes |
|------|---------|
| `src/orderbook/fetcher.ts` | Used centralized constants, extracted parsing helpers |
| `src/arbitrage/liquidity-analyzer.ts` | Broke into smaller functions, extracted formatters |
| `src/scripts/find-matched-markets.ts` | Removed type shadows, used config constants, extracted display functions |

### Key Improvements

1. **Removed type shadowing** - Local `MarketData` interface was shadowing import from `market-matcher.ts`
2. **Extracted helper functions** - Large functions broken into focused units
3. **Centralized configuration** - All magic numbers moved to config module
4. **Improved type organization** - Re-exports allow cleaner imports
5. **Added error context** - Typed errors include platform, status codes, and metadata

### Verification

All scripts verified working after refactoring:
```bash
npx tsx src/scripts/find-matched-markets.ts  # ✓ Full pipeline works
```

---

## Stage 5: REST API Server (COMPLETED)

**Goal:** Expose scanner functionality via HTTP API for frontend consumption.

### API Implementation
- [x] Create `src/api/server.ts` - Express server with CORS
- [x] Create `src/api/services/scanner.service.ts` - Scanner orchestration
- [x] Create `src/api/processors/opportunity.processor.ts` - Response transformation
- [x] Endpoint: `GET /api/opportunities` - Returns all opportunities with liquidity data

### Key Features
- [x] **Scan caching** - 60-second TTL to avoid excessive API calls
- [x] **Scan locking** - Prevents concurrent scans (subsequent requests wait for ongoing scan)
- [x] **Sequential processing** - Events processed sequentially to avoid rate limiting (HTTP 429)
- [x] **Limited liquidity analysis** - Only top 70 opportunities analyzed for order book depth

### API Response Fields
```typescript
interface OpportunityDto {
  id: string;
  eventName: string;
  marketName: string;
  category: string;
  imageUrl: string | null;
  type: 'guaranteed' | 'spread';
  spreadPct: number;           // Order book spread (not last-traded!)
  action: string;
  potentialProfit: number;
  maxInvestment: number;
  timeToResolution: string | null;  // ISO date of earliest resolution
  roi: number | null;          // Return on investment (profit/investment * 100)
  apr: number | null;          // Annualized return based on time to resolution
  prices: {
    polymarket: { yes: number; no: number };
    kalshi: { yes: number; no: number };
    orderBook: {
      polyYesAsk: number;
      kalshiNoAsk: number;
      totalCost: number;
      profitPct: number;
    } | null;
  };
  urls: { polymarket: string | null; kalshi: string | null };
  liquidity: { status: string; limitedBy: string | null };
  lastUpdated: string;
}
```

### Key Learnings

**1. API Hanging Issue**
- **Problem:** Analyzing liquidity for 108+ opportunities took too long (~324 API calls)
- **Solution:** Limit liquidity analysis to top 70 opportunities by spread

**2. Concurrent Scan Race Condition**
- **Problem:** Multiple API requests triggered parallel scans, causing duplicate work
- **Solution:** Promise-based scan lock - subsequent requests await the ongoing scan
```typescript
let scanInProgress: Promise<ScanResult> | null = null;

export async function runScan(): Promise<ScanResult> {
  if (scanInProgress) {
    return scanInProgress;  // Wait for existing scan
  }
  scanInProgress = performScan();
  try {
    return await scanInProgress;
  } finally {
    scanInProgress = null;
  }
}
```

**3. Rate Limiting (HTTP 429)**
- **Problem:** Parallel event fetching triggered Kalshi rate limits
- **Solution:** Sequential processing with 50ms delays between requests

**4. Order Book Spread vs Last-Traded Spread**
- **Problem:** API was showing last-traded spread, not executable order book spread
- **Solution:** Always use `orderBookProfitPct` when liquidity data available
- **Critical:** Spread = `100 - (polyYesAsk + kalshiNoAsk)`, NOT `|polyYes - kalshiYes|`

**5. Time to Resolution**
- **Problem:** `timeToResolution` was always null
- **Solution:** Parse `endDate` from Polymarket and `expected_expiration_time` from Kalshi, use earliest

**6. ROI and APR Calculations**
- ROI = `(profit / investment) * 100`
- APR = `ROI * (365 / daysToResolution)` - annualized return for comparison
- Short-term opportunities (2 days) can show 200%+ APR even with 1% ROI

### Run API Server
```bash
cd backend && npm run api
# Server runs on http://localhost:3001
```

---

## Stage 6: Frontend Dashboard (COMPLETED)

**Goal:** Build a Next.js frontend to display arbitrage opportunities.

### Tech Stack
- Next.js 14 (App Router)
- TanStack React Query (data fetching)
- shadcn/ui components
- Tailwind CSS

### Features Implemented
- [x] Opportunities table with all fields
- [x] Category badges (NBA, Championships, Weather, Finance, Politics)
- [x] Liquidity status badges (Available, Spread Closed, No Liquidity)
- [x] Action links to Polymarket and Kalshi with order book prices
- [x] ROI and APR columns
- [x] Time to resolution (e.g., "2d 5h")
- [x] Sort by ROI descending (best opportunities first)
- [x] Toggle to hide non-profitable opportunities (ROI <= 0)
- [x] Refresh button with loading spinner
- [x] Auto-refresh every 60 seconds
- [x] Responsive design

### shadcn Components Used
- `table`, `badge`, `button`, `switch`, `label`

### Key Files
```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main dashboard page
│   │   └── layout.tsx            # Root layout with providers
│   ├── components/
│   │   ├── opportunities-table.tsx  # Main table component
│   │   ├── providers.tsx         # React Query provider
│   │   └── ui/                   # shadcn components
│   ├── hooks/
│   │   └── use-opportunities.ts  # Data fetching hook
│   ├── lib/
│   │   └── api.ts               # API client
│   └── types/
│       └── index.ts             # TypeScript types
```

### Run Frontend
```bash
cd frontend && npm run dev
# Frontend runs on http://localhost:3000
```

---

## Stage 7: NBA Game Matching (COMPLETED)

**Goal:** Match individual NBA games between Polymarket and Kalshi for daily arbitrage.

### Implementation
- [x] Create `src/matching/nba-game-matcher.ts` - NBA game discovery
- [x] Fetch NBA schedule from `cdn.nba.com` API
- [x] Generate Polymarket slugs: `nba-{away}-{home}-{date}`
- [x] Generate Kalshi tickers: `KXNBAGAME-{YY}{MON}{DD}{AWAY}{HOME}`
- [x] Match team moneyline markets between platforms

### Key Learnings

**1. Team Order in Polymarket Questions**
- **Problem:** Polymarket question format varies: "Thunder vs. Spurs" or "Spurs vs. Thunder"
- **Impact:** `prices[0]` (yesPrice) corresponds to FIRST team listed, not away team
- **Solution:** Parse question to detect team positions, assign prices accordingly
```typescript
const awayPos = question.indexOf(awayTeam);
const homePos = question.indexOf(homeTeam);
const awayIsFirst = awayPos < homePos;

if (awayIsFirst) {
  awayPolyYes = polyMoneyline.yesPrice;
  homePolyYes = 1 - polyMoneyline.yesPrice;
} else {
  homePolyYes = polyMoneyline.yesPrice;
  awayPolyYes = 1 - polyMoneyline.yesPrice;
}
```

**2. Token ID Assignment**
- `tokenIds[0]` = YES token for FIRST team in question
- `tokenIds[1]` = NO token for first team (= YES for second team)
- Must track correctly for order book fetching

**3. Excluding Non-Moneyline Markets**
- Polymarket has spreads, totals, props, quarter/half markets
- Filter by excluding keywords: "spread", "o/u", "over", "under", "total", "points", "quarter", "half"
- Use word boundaries to avoid false positives (e.g., "Thunder" matching "under")

---

## Future Enhancements (Post-MVP)

- [ ] WebSocket real-time streaming
- [ ] Execution engine (place orders)
- [ ] Position manager (track holdings)
- [ ] Alerting (Discord/Telegram notifications)
- [ ] Historical opportunity logging
- [ ] Weather mispricing detector (consistency check for shifted boundaries)
- [ ] More sports leagues (MLS, NCAA, etc.)
- [ ] Mobile-responsive improvements
- [ ] Dark mode toggle

---

## Project Structure
```
backend/
├── src/
│   ├── api/
│   │   ├── server.ts                # Express API server
│   │   ├── services/
│   │   │   └── scanner.service.ts   # Scanner orchestration
│   │   └── processors/
│   │       └── opportunity.processor.ts  # Response transformation
│   ├── config/
│   │   └── api.ts                   # API URLs, timeouts, thresholds
│   ├── types/
│   │   ├── index.ts                 # Type re-exports
│   │   ├── polymarket.ts
│   │   ├── kalshi.ts
│   │   └── unified.ts
│   ├── errors/
│   │   └── index.ts                 # Typed error classes
│   ├── connectors/
│   │   ├── polymarket-connector.ts
│   │   └── kalshi-connector.ts
│   ├── matching/
│   │   ├── catalog-matcher.ts       # Config-driven event matching
│   │   ├── market-matcher.ts        # Market-level matching within events
│   │   ├── nba-game-matcher.ts      # NBA game discovery and matching
│   │   └── normalizers/
│   │       └── sports.ts            # Team name normalization
│   ├── orderbook/
│   │   └── fetcher.ts               # Order book fetching
│   ├── arbitrage/
│   │   ├── calculator.ts            # Arbitrage opportunity detection
│   │   └── liquidity-analyzer.ts    # Order book capacity analysis
│   └── scripts/
│       ├── polymarket-explorer.ts
│       ├── kalshi-explorer.ts
│       ├── test-connectors.ts
│       ├── list-all-markets.ts
│       ├── find-matched-markets.ts  # Main scanner CLI
│       ├── test-orderbook.ts
│       └── debug-barcelona.ts

frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Dashboard page
│   │   └── layout.tsx               # Root layout
│   ├── components/
│   │   ├── opportunities-table.tsx  # Main table component
│   │   ├── providers.tsx            # React Query provider
│   │   └── ui/                      # shadcn components
│   ├── hooks/
│   │   └── use-opportunities.ts     # Data fetching hook
│   ├── lib/
│   │   └── api.ts                   # API client
│   └── types/
│       └── index.ts                 # TypeScript types

config/
├── market-mappings.json             # Event catalog (static + dynamic patterns)
└── teams.json                       # Team name aliases
```

---

## Quick Start

```bash
# Start backend API (terminal 1)
cd backend && npm run api

# Start frontend (terminal 2)
cd frontend && npm run dev

# Or run CLI scanner directly
cd backend && npx tsx src/scripts/find-matched-markets.ts
```

---

## Verification Checklist
- [x] Explorer scripts connect to both APIs successfully
- [x] Unified data model correctly normalizes prices
- [x] Catalog matcher finds events on both platforms
- [x] Market-level matching pairs individual markets (sports teams)
- [x] Arbitrage calculator detects guaranteed profit opportunities
- [x] Weather market boundaries analyzed (not arbitrageable)
- [x] Order book fetching works for both platforms
- [x] Liquidity analyzer correctly identifies spread_closed vs no_liquidity
- [x] Last trade vs order book price discrepancy documented
- [x] API server with scan locking and caching
- [x] Frontend dashboard with opportunities table
- [x] ROI and APR calculations
- [x] NBA game matching with correct team/price assignment
- [ ] Manually verify detected opportunities on both platforms
- [ ] Execute a test trade to validate end-to-end flow
