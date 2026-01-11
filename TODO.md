# TODO.md - PolyOracle Arbitrage Scanner

## Overview
Build a prediction market arbitrage scanner that detects ROI-positive opportunities between Polymarket and Kalshi.

**Configuration:**
- Minimum ROI threshold: 1% after fees
- Update method: REST polling (30-60s intervals)
- Fee estimates: ~2% Polymarket, ~1% Kalshi

---

## Stage 1: API Exploration

### Phase 1a: Polymarket (COMPLETED)
- [x] Set up project (`npm init`, `tsconfig.json`, dependencies)
- [x] Create `src/types/polymarket.ts` with TypeScript interfaces
- [x] Build `src/scripts/polymarket-explorer.ts` to fetch:
  - [x] Events via Gamma API (`/events`)
  - [x] Markets and outcomes (`/markets`)
  - [x] Order book data via CLOB API (`/book`)
  - [x] Price/midpoint data (`/price`, `/midpoint`)
- [x] Document Polymarket data model (fields, relationships, price format)

**Polymarket Key Findings:**

*Data Model:*
- Events → Markets (1:many) → Outcomes (YES/NO)
- Prices are 0-1 decimals representing probability (e.g., 0.45 = 45% chance)
- Fields like `outcomes`, `outcomePrices`, `clobTokenIds` are JSON-encoded strings (must parse)
- `clobTokenIds[0]` = YES token, `clobTokenIds[1]` = NO token

*Two APIs with Different Purposes:*

| API | Base URL | Purpose | Use For |
|-----|----------|---------|---------|
| **Gamma** | `gamma-api.polymarket.com` | Market discovery & metadata | Finding events, titles, slugs, aggregate stats |
| **CLOB** | `clob.polymarket.com` | Trading & real-time pricing | Order book depth, precise prices, execution |

- **Gamma API**: Returns event/market info with snapshot prices (`outcomePrices`). Good for browsing/searching.
- **CLOB API**: Returns actual order book (bids/asks), midpoint price, liquidity depth. Essential for arbitrage.
- **Bridge**: `clobTokenIds` from Gamma link to CLOB order books via `token_id` parameter.
- CLOB uses snake_case (`asset_id`, `last_trade_price`)
- Search events: use `title_contains` parameter on Gamma `/events`

*For Arbitrage:*
- Use Gamma to discover and match events across platforms
- Use CLOB to get precise prices and verify liquidity before execution

### Phase 1b: Kalshi (COMPLETED - Updated with SDK)
- [x] Create `src/types/kalshi.ts` with TypeScript interfaces
- [x] Build `src/scripts/kalshi-explorer.ts` to fetch:
  - [x] Events (`/events`)
  - [x] Markets (`/markets`)
  - [x] Order book (`/markets/{ticker}/orderbook`)
  - [x] Series data (`/series`)
- [x] Document Kalshi data model and price format
- [x] **Upgraded to official TypeScript SDK** (`kalshi-typescript`)

**Kalshi Key Findings:**

*Official SDK:*
- Package: `kalshi-typescript` (npm install kalshi-typescript)
- Documentation: https://docs.kalshi.com/sdks/typescript/quickstart
- Uses `EventsApi.getEvents()` with `withNestedMarkets=true` to fetch events AND markets in one call
- Eliminates N+1 API call problem completely
- Rate limits: Basic tier = 20 reads/sec (automatic, no auth needed for reads)

*API Access:*
- Base URL: `https://api.elections.kalshi.com/trade-api/v2`
- **No authentication required** for read-only public data
- Pagination: cursor-based, max 200 events per page

*Data Model:*
- Series → Events → Markets (binary outcomes)
- Series are templates for recurring events (e.g., "Weekly Jobless Claims")
- Events group related markets (e.g., "Who will be the next Pope?")
- Markets are individual binary contracts with YES/NO outcomes

*Pricing:*
- SDK provides prices as dollar strings: `yes_bid_dollars: "0.0700"`
- Already in 0-1 format, use `parseFloat()` directly
- No conversion needed (unlike raw API which uses cents)

*Key Differences from Polymarket:*

| Aspect | Polymarket | Kalshi |
|--------|------------|--------|
| Price format | 0-1 decimals | 0-1 dollars (SDK) |
| Order book | Combined (bids/asks) | Separate YES/NO sides |
| Token IDs | Long numeric strings | Human-readable tickers |
| Auth for reads | Not required | Not required |
| SDK | None (REST only) | `kalshi-typescript` |

*Run the explorer:*
```bash
npm run explore:kalshi
```

---

## Stage 2: Unified Data Model (COMPLETED)

- [x] Design `src/types/unified.ts` with platform-agnostic types:
  - [x] `UnifiedEvent` - normalized event representation
  - [x] `UnifiedMarket` - binary market with YES/NO prices
  - [x] `Platform` type for source tracking
  - [x] `FetchResult<T>` for error handling
  - [x] Validation helpers (`isValidPrice`, `hasValidPricing`, etc.)
- [x] Build `src/connectors/polymarket-connector.ts`:
  - [x] Fetch events/markets from Polymarket Gamma API
  - [x] Parse JSON-encoded fields (`outcomePrices`, `clobTokenIds`)
  - [x] Filter non-binary and closed markets
  - [x] Normalize prices (already 0-1)
  - [x] Pagination support with `fetchAllPolymarketEvents()`
- [x] Build `src/connectors/kalshi-connector.ts`:
  - [x] **Upgraded to use official `kalshi-typescript` SDK**
  - [x] Uses `withNestedMarkets=true` to fetch events WITH markets (no N+1 problem)
  - [x] Filter non-binary and inactive markets
  - [x] Pagination support with `fetchAllKalshiEvents()`
- [x] Test connectors with `npm run test:connectors`
- [x] List all markets with `npm run list:markets`

**Stage 2 Key Implementation Notes:**

*Market Coverage (as of Jan 2025):*
| Platform | Events | Markets | Volume |
|----------|--------|---------|--------|
| Polymarket | ~5,000 | ~21,000 | ~$2.4B |
| Kalshi | ~3,300 | ~21,400 | ~$470M |
| **Total** | ~8,300 | ~42,600 | ~$2.9B |

*Unified Types:*
- `UnifiedMarket`: Contains `yesPrice`, `noPrice`, `yesBid`, `yesAsk`, `noBid`, `noAsk` (all 0-1)
- `UnifiedEvent`: Groups related markets with platform/category info
- `FetchResult<T>`: Returns `{ data, errors, fetchedAt }` for debugging

*Price Normalization:*
- Polymarket: Already 0-1, use directly
- Kalshi (SDK): Already 0-1 via `_dollars` fields

*Pagination:*
- Polymarket: offset-based, 200 events/page, ~30s to fetch all
- Kalshi: cursor-based, 200 events/page, ~7s to fetch all (SDK is fast!)

*Run tests:*
```bash
npm run test:connectors  # Quick validation test
npm run list:markets     # Full market listing
```

---

## Stage 3: Event Matching (COMPLETED)

- [x] Build `src/matching/types.ts` with matching type definitions
- [x] Build `src/matching/text-normalizer.ts`:
  - [x] Stopwords, abbreviations, synonyms
  - [x] Text normalization and tokenization
  - [x] Year/month extraction
- [x] Build `src/matching/similarity.ts`:
  - [x] Levenshtein distance (with early termination)
  - [x] Jaccard coefficient for token overlap
  - [x] Date proximity scoring
  - [x] Category matching
  - [x] Market question similarity
- [x] Build `src/matching/blocking-strategy.ts`:
  - [x] Generate blocking keys (year, category, tokens, bigrams)
  - [x] 92%+ reduction in comparisons (250K → 19K)
- [x] Build `src/matching/event-matcher.ts`:
  - [x] Main orchestrator class
  - [x] Configurable thresholds and weights
  - [x] Confirmed vs uncertain match classification
- [x] Build `src/matching/match-cache.ts`:
  - [x] Cache confirmed event matches
  - [x] Allow manual match overrides
  - [x] Persist to JSON file (`data/match-cache.json`)
- [x] Build `src/scripts/test-matching.ts` for validation

**Stage 3 Key Findings:**

*Performance:*
- Blocking strategy reduces 250K comparisons to ~19K (92.2% reduction)
- Full matching of 500×500 events in ~5 seconds
- Cache persists matches for faster subsequent runs

*Matching Results (sample run):*
| Match Type | Count | Score Range |
|------------|-------|-------------|
| Confirmed | 5 | >= 75% |
| Uncertain | 61 | 50-75% |
| Total Candidates | 66 | >= 50% |

*Example Confirmed Matches:*
- "Who will Trump nominate as Fed Chair?" - 82.5%
- "Where will Trump and Putin meet next?" - 77.5%
- "Which party will win the Senate in 2026?" - 76.2%

*Run the matcher:*
```bash
npm run test:matching
```

---

## Stage 4: Arbitrage Detection

- [ ] Define `src/arbitrage/types.ts`:
  - [ ] `ArbitrageOpportunity` interface
  - [ ] `SpreadInfo` with buy/sell sides
- [ ] Build `src/arbitrage/spread-calculator.ts`:
  - [ ] Calculate raw price spread
  - [ ] Account for platform fees
  - [ ] Compute net ROI percentage
- [ ] Build `src/arbitrage/opportunity-detector.ts`:
  - [ ] Filter opportunities above 1% ROI threshold
  - [ ] Rank by profitability
  - [ ] Include liquidity checks (order book depth)

---

## Stage 5: Scanner CLI

- [ ] Create `src/config.ts`:
  - [ ] Load from `.env` (API keys, thresholds)
  - [ ] Default configuration values
- [ ] Build `src/scanner.ts`:
  - [ ] Polling loop with configurable interval
  - [ ] Fetch data from both connectors
  - [ ] Run event matching
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
- [ ] Multi-market arbitrage (3+ platforms)

---

## Project Structure
```
src/
├── scanner.ts              # Main entry (TODO)
├── config.ts               # Configuration (TODO)
├── types/
│   ├── polymarket.ts
│   ├── kalshi.ts
│   └── unified.ts
├── connectors/
│   ├── polymarket-connector.ts
│   └── kalshi-connector.ts
├── matching/
│   ├── types.ts            # Matching type definitions
│   ├── text-normalizer.ts  # Text preprocessing
│   ├── similarity.ts       # Similarity algorithms
│   ├── blocking-strategy.ts # Pre-filtering for efficiency
│   ├── event-matcher.ts    # Main orchestrator
│   └── match-cache.ts      # JSON persistence
├── arbitrage/
│   ├── spread-calculator.ts (TODO)
│   ├── opportunity-detector.ts (TODO)
│   └── types.ts (TODO)
└── scripts/
    ├── polymarket-explorer.ts
    ├── kalshi-explorer.ts
    ├── test-connectors.ts
    ├── list-all-markets.ts
    └── test-matching.ts

data/
└── match-cache.json        # Cached matches
```

---

## Verification Checklist
- [x] Explorer scripts connect to both APIs successfully
- [x] Unified data model correctly normalizes prices (100% validation pass)
- [x] Event matcher finds known equivalent events (Fed, Trump, Senate 2026)
- [ ] Scanner detects opportunities in `--dry-run` mode
- [ ] Manually verify detected opportunities on both platforms
