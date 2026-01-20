# Real-time Arbitrage Engine Architecture

## Goal
Build a system that pairs orderbooks from Polymarket and Kalshi via WebSocket streams and dynamically computes arbitrage opportunities.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ArbitrageEngine                              │
│                                                                 │
│  ┌──────────────────┐       ┌──────────────────┐              │
│  │ KalshiWebSocket  │       │ PolymarketWebSocket│             │
│  │     Client       │       │      Client       │              │
│  └────────┬─────────┘       └────────┬──────────┘              │
│           │                          │                          │
│           │    orderbook events      │                          │
│           └──────────┬───────────────┘                          │
│                      ▼                                          │
│           ┌──────────────────────┐                             │
│           │  OrderbookAggregator │  ← Normalizes to unified    │
│           │                      │    format (0-1 probability) │
│           └──────────┬───────────┘                             │
│                      ▼                                          │
│           ┌──────────────────────┐                             │
│           │  MarketPairRegistry  │  ← Maps Kalshi ticker ↔     │
│           │                      │    Polymarket token IDs     │
│           └──────────┬───────────┘                             │
│                      ▼                                          │
│           ┌──────────────────────┐                             │
│           │ ArbitrageCalculator  │  ← Computes spreads when    │
│           │                      │    either orderbook updates │
│           └──────────┬───────────┘                             │
│                      ▼                                          │
│           ┌──────────────────────┐                             │
│           │   Event Emitter      │  → 'opportunity' events     │
│           └──────────────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. `ArbitrageEngine` (new: `src/arbitrage/engine.ts`)
Main orchestrator class.

```typescript
interface ArbitrageEngineConfig {
  pairs: MarketPairMapping[];      // Kalshi ↔ Polymarket mappings
  minSpreadPercent: number;        // Threshold to emit opportunity (default: 2%)
  debounceMs: number;              // Debounce rapid updates (default: 100ms)
}

class ArbitrageEngine extends EventEmitter {
  private kalshi: KalshiWebSocketClient;
  private polymarket: PolymarketWebSocketClient;
  private aggregator: OrderbookAggregator;

  start(): void;                   // Connect both clients, subscribe to pairs
  stop(): void;                    // Disconnect
  addPair(pair: MarketPairMapping): void;
  removePair(pairId: string): void;

  // Events: 'opportunity', 'orderbook_update', 'connected', 'error'
}
```

### 2. `OrderbookAggregator` (new: `src/arbitrage/orderbook-aggregator.ts`)
Normalizes orderbooks to a unified format.

```typescript
interface NormalizedOrderbook {
  platform: 'kalshi' | 'polymarket';
  marketId: string;                // ticker or assetId
  yesBids: Array<{price: number; size: number}>;  // price: 0-1
  yesAsks: Array<{price: number; size: number}>;
  updatedAt: Date;
}

class OrderbookAggregator {
  normalizeKalshi(ob: OrderBookState): NormalizedOrderbook;
  normalizePolymarket(ob: PolymarketOrderBookState): NormalizedOrderbook;
}
```

**Price normalization:**
- Kalshi: `price / 100` (cents → probability)
- Polymarket: `price / 1000` (tenths of cent → probability)
- Kalshi NO bids → YES asks at `1 - price`

### 3. `MarketPairRegistry` (new: `src/arbitrage/pair-registry.ts`)
Maps market identifiers across platforms.

```typescript
interface MarketPairMapping {
  id: string;                      // Unique pair identifier
  kalshiTicker: string;            // e.g., "KXNFLGAME-26JAN18HOUNE-NE"
  polymarketYesToken: string;      // 77-digit token ID for YES
  polymarketNoToken: string;       // 77-digit token ID for NO
  description?: string;
}

class MarketPairRegistry {
  addPair(mapping: MarketPairMapping): void;
  getPairByKalshi(ticker: string): MarketPairMapping | undefined;
  getPairByPolymarket(tokenId: string): MarketPairMapping | undefined;
  getAllPairs(): MarketPairMapping[];
}
```

### 4. Extend existing `ArbitrageCalculator`
Add method for real-time spread calculation from normalized orderbooks.

```typescript
// Add to src/arbitrage/calculator.ts
function calculateSpreadFromOrderbooks(
  kalshiOb: NormalizedOrderbook,
  polyOb: NormalizedOrderbook
): ArbitrageOpportunity | null;
```

---

## Data Flow

1. **Subscription**: Engine subscribes to Kalshi tickers and Polymarket tokens for each pair
2. **Update**: WebSocket client emits `orderbook` event
3. **Normalize**: Aggregator converts to unified format
4. **Lookup**: Registry finds the paired market
5. **Calculate**: If both orderbooks available, compute spread
6. **Emit**: If spread > threshold, emit `opportunity` event

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/arbitrage/engine.ts` | **Create** - Main ArbitrageEngine class |
| `src/arbitrage/orderbook-aggregator.ts` | **Create** - Normalizes orderbooks |
| `src/arbitrage/pair-registry.ts` | **Create** - Market pair mappings |
| `src/arbitrage/types.ts` | **Create** - Shared types |
| `src/arbitrage/calculator.ts` | **Modify** - Add real-time calculation |
| `src/arbitrage/index.ts` | **Modify** - Export new modules |
| `src/scripts/test-arbitrage-engine.ts` | **Create** - Test script |

---

## Usage Example

```typescript
import { ArbitrageEngine } from './arbitrage/engine.js';

const engine = new ArbitrageEngine({
  pairs: [{
    id: 'nfl-playoffs-ne',
    kalshiTicker: 'KXNFLGAME-26JAN18HOUNE-NE',
    polymarketYesToken: '2174263...',
    polymarketNoToken: '8372615...',
  }],
  minSpreadPercent: 2,
});

engine.on('opportunity', (opp) => {
  console.log(`Arbitrage found: ${opp.spread}% spread`);
  console.log(`Buy YES on ${opp.buyPlatform} @ ${opp.buyPrice}`);
  console.log(`Buy NO on ${opp.sellPlatform} @ ${opp.sellPrice}`);
});

engine.start();
```

---

## Verification

1. **TypeScript compilation:**
   ```bash
   npx tsc --noEmit
   ```

2. **Test with a known pair:**
   ```bash
   npx tsx src/scripts/test-arbitrage-engine.ts
   ```

3. **Verify orderbook updates trigger recalculation**

4. **Verify opportunities are emitted when spread exceeds threshold**
