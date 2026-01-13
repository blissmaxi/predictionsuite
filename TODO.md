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

## Stage 5: Scanner CLI (TODO)

- [ ] Create `src/config.ts`:
  - [ ] Load from `.env` (API keys, thresholds)
  - [ ] Default configuration values
- [ ] Build `src/scanner.ts`:
  - [ ] Polling loop with configurable interval
  - [ ] Fetch data from both connectors
  - [ ] Run catalog matching + market-level matching
  - [ ] Detect arbitrage opportunities
  - [ ] Output results (console table / JSON)
  - [ ] Add `--dry-run` flag for testing
- [ ] Create `.env.example` with required variables

---

## Future Enhancements (Post-MVP)

- [ ] WebSocket real-time streaming
- [ ] Execution engine (place orders)
- [ ] Position manager (track holdings)
- [ ] Alerting (Discord/Telegram notifications)
- [ ] Historical opportunity logging
- [ ] Weather mispricing detector (consistency check for shifted boundaries)
- [ ] More sports leagues (MLS, NCAA, etc.)

---

## Project Structure
```
src/
├── scanner.ts                    # Main entry (TODO)
├── config.ts                     # Configuration (TODO)
├── types/
│   ├── polymarket.ts
│   ├── kalshi.ts
│   └── unified.ts
├── connectors/
│   ├── polymarket-connector.ts
│   └── kalshi-connector.ts
├── matching/
│   ├── catalog-matcher.ts        # Config-driven event matching
│   ├── market-matcher.ts         # Market-level matching within events
│   └── normalizers/
│       └── sports.ts             # Team name normalization
├── orderbook/
│   └── fetcher.ts                # Order book fetching
├── arbitrage/
│   ├── calculator.ts             # Arbitrage opportunity detection
│   └── liquidity-analyzer.ts     # Order book capacity analysis
└── scripts/
    ├── polymarket-explorer.ts
    ├── kalshi-explorer.ts
    ├── test-connectors.ts
    ├── list-all-markets.ts
    ├── find-matched-markets.ts   # Main scanner script
    ├── test-orderbook.ts         # Order book pipeline testing
    └── debug-barcelona.ts        # Last trade vs order book comparison

config/
├── market-mappings.json          # Event catalog (static + dynamic patterns)
└── teams.json                    # Team name aliases (NFL, NBA, NHL, MLB, Soccer)
```

---

## Quick Start

```bash
# Run the arbitrage scanner
npx tsx src/scripts/find-matched-markets.ts

# Explore Polymarket API
npm run explore:polymarket

# Explore Kalshi API
npm run explore:kalshi
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
- [ ] Scanner polling loop with configurable interval
- [ ] Manually verify detected opportunities on both platforms
