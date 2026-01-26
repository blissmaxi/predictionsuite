/**
 * Arbitrage Engine
 *
 * Orchestrates real-time arbitrage detection between Kalshi and Polymarket.
 * Subscribes to orderbook updates via WebSocket and emits opportunities.
 */

import { EventEmitter } from 'events';
import { KalshiWebSocketClient } from '../websocket/kalshi-client.js';
import { PolymarketWebSocketClient } from '../websocket/polymarket-client.js';
import { MarketPairRegistry } from './pair-registry.js';
import { OrderbookAggregator } from './orderbook-aggregator.js';
import type {
  ArbitrageEngineConfig,
  ArbitrageEngineEvents,
  ArbitrageOpportunity,
  MarketPairMapping,
  NormalizedOrderbook,
  Platform,
} from './types.js';

// ============ Constants ============

const DEFAULT_MIN_SPREAD_PERCENT = 2;
const DEFAULT_DEBOUNCE_MS = 100;

// ============ Engine Class ============

export class ArbitrageEngine extends EventEmitter {
  private kalshi: KalshiWebSocketClient;
  private polymarket: PolymarketWebSocketClient;
  private registry: MarketPairRegistry;
  private aggregator: OrderbookAggregator;

  private kalshiOrderbooks = new Map<string, NormalizedOrderbook>();
  private polymarketOrderbooks = new Map<string, NormalizedOrderbook>();
  private activeOpportunities = new Map<string, ArbitrageOpportunity>();

  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private minSpreadPercent: number;
  private debounceMs: number;

  private kalshiConnected = false;
  private polymarketConnected = false;

  constructor(config: ArbitrageEngineConfig) {
    super();

    this.minSpreadPercent = config.minSpreadPercent ?? DEFAULT_MIN_SPREAD_PERCENT;
    this.debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS;

    this.kalshi = new KalshiWebSocketClient();
    this.polymarket = new PolymarketWebSocketClient();
    this.registry = new MarketPairRegistry();
    this.aggregator = new OrderbookAggregator();

    // Register initial pairs
    if (config.pairs.length > 0) {
      this.registry.addPairs(config.pairs);
    }

    this.setupEventHandlers();
  }

  // ============ Public API ============

  /**
   * Start the engine: connect to both platforms and subscribe to pairs.
   */
  start(): void {
    this.kalshi.connect();
    this.polymarket.connect();
  }

  /**
   * Stop the engine: disconnect from both platforms.
   */
  stop(): void {
    this.clearAllDebounceTimers();
    this.kalshi.disconnect();
    this.polymarket.disconnect();
    this.kalshiOrderbooks.clear();
    this.polymarketOrderbooks.clear();
    this.activeOpportunities.clear();
  }

  /**
   * Add a market pair to monitor.
   */
  addPair(pair: MarketPairMapping): void {
    this.registry.addPair(pair);
    this.subscribeToMarket(pair);
  }

  /**
   * Remove a market pair.
   */
  removePair(pairId: string): void {
    const pair = this.registry.getPair(pairId);
    if (pair) {
      this.unsubscribeFromMarket(pair);
      this.registry.removePair(pairId);

      // Clean up state
      this.kalshiOrderbooks.delete(pair.kalshiTicker);
      this.polymarketOrderbooks.delete(pairId);

      if (this.activeOpportunities.has(pairId)) {
        this.activeOpportunities.delete(pairId);
        this.emit('opportunity_closed', pairId);
      }
    }
  }

  /**
   * Get all registered pairs.
   */
  getPairs(): MarketPairMapping[] {
    return this.registry.getAllPairs();
  }

  /**
   * Get current orderbook for a pair.
   */
  getOrderbooks(pairId: string): {
    kalshi: NormalizedOrderbook | undefined;
    polymarket: NormalizedOrderbook | undefined;
  } {
    const pair = this.registry.getPair(pairId);
    if (!pair) {
      return { kalshi: undefined, polymarket: undefined };
    }

    return {
      kalshi: this.kalshiOrderbooks.get(pair.kalshiTicker),
      polymarket: this.polymarketOrderbooks.get(pairId),
    };
  }

  /**
   * Get all active opportunities.
   */
  getActiveOpportunities(): ArbitrageOpportunity[] {
    return Array.from(this.activeOpportunities.values());
  }

  /**
   * Check if both platforms are connected.
   */
  isFullyConnected(): boolean {
    return this.kalshiConnected && this.polymarketConnected;
  }

  // ============ Event Handlers ============

  private setupEventHandlers(): void {
    // Kalshi events
    this.kalshi.on('connected', () => {
      this.kalshiConnected = true;
      this.emit('connected', 'kalshi');
      this.subscribeToAllKalshiMarkets();
    });

    this.kalshi.on('disconnected', (code, reason) => {
      this.kalshiConnected = false;
      this.emit('disconnected', 'kalshi', code, reason);
    });

    this.kalshi.on('error', (error) => {
      this.emit('error', error);
    });

    this.kalshi.on('orderbook', (marketTicker, orderbook) => {
      const normalized = this.aggregator.normalizeKalshi(marketTicker, orderbook);
      this.kalshiOrderbooks.set(marketTicker, normalized);
      this.emit('orderbook_update', 'kalshi', marketTicker, normalized);
      //this.scheduleArbitrageCheck(marketTicker, 'kalshi');
      this.simpleArb(marketTicker, 'kalshi');
    });

    // Polymarket events
    this.polymarket.on('connected', () => {
      this.polymarketConnected = true;
      this.emit('connected', 'polymarket');
      this.subscribeToAllPolymarketMarkets();
    });

    this.polymarket.on('disconnected', (code, reason) => {
      this.polymarketConnected = false;
      this.emit('disconnected', 'polymarket', code, reason);
    });

    this.polymarket.on('error', (error) => {
      this.emit('error', error);
    });

    this.polymarket.on('orderbook', (assetId, orderbook) => {
      const pair = this.registry.getPairByPolymarket(assetId);
      if (!pair) return;

      // Get both YES and NO orderbooks and merge them
      const yesOrderbook = this.polymarket.getOrderbook(pair.polymarketYesToken);
      const noOrderbook = this.polymarket.getOrderbook(pair.polymarketNoToken);

      const merged = this.aggregator.mergePolymarketOrderbooks(
        pair.polymarketYesToken,
        yesOrderbook,
        noOrderbook
      );

      if (merged) {
        this.polymarketOrderbooks.set(pair.id, merged);
        this.emit('orderbook_update', 'polymarket', pair.id, merged);
        //this.scheduleArbitrageCheck(pair.id, 'polymarket');
        this.simpleArb(pair.id, 'polymarket');
      }
    });
  }

  // ============ Subscription Management ============

  private subscribeToAllKalshiMarkets(): void {
    const tickers = this.registry.getKalshiTickers();
    if (tickers.length > 0) {
      this.kalshi.subscribeMany(tickers);
    }
  }

  private subscribeToAllPolymarketMarkets(): void {
    const tokens = this.registry.getPolymarketTokens();
    if (tokens.length > 0) {
      this.polymarket.subscribeMany(tokens);
    }
  }

  private subscribeToMarket(pair: MarketPairMapping): void {
    if (this.kalshiConnected) {
      this.kalshi.subscribe(pair.kalshiTicker);
    }
    if (this.polymarketConnected) {
      this.polymarket.subscribe(pair.polymarketYesToken);
      this.polymarket.subscribe(pair.polymarketNoToken);
    }
  }

  private unsubscribeFromMarket(pair: MarketPairMapping): void {
    this.kalshi.unsubscribe(pair.kalshiTicker);
    this.polymarket.unsubscribe(pair.polymarketYesToken);
    this.polymarket.unsubscribe(pair.polymarketNoToken);
  }

  private simpleArb(marketId: string, platform: Platform): void {
    const pair =
      platform === 'kalshi'
        ? this.registry.getPairByKalshi(marketId)
        : this.registry.getPair(marketId);

    if (!pair) return;

    const kalshiOb = this.kalshiOrderbooks.get(pair.kalshiTicker);
    const polyOb = this.polymarketOrderbooks.get(pair.id);

    // Need both orderbooks to compare
    if (!kalshiOb || !polyOb) return;

    // Get best ask prices for YES and NO on each platform
    const kalshiYesAsk = kalshiOb.yesAsks[0]?.price;
    const kalshiNoAsk = kalshiOb.noAsks[0]?.price;
    const polyYesAsk = polyOb.yesAsks[0]?.price;
    const polyNoAsk = polyOb.noAsks[0]?.price;

    if (kalshiYesAsk === undefined || kalshiNoAsk === undefined ||
        polyYesAsk === undefined || polyNoAsk === undefined) {
      return;
    }

    // Find cheapest YES and NO across platforms
    const bestYesAsk = Math.min(kalshiYesAsk, polyYesAsk);
    const bestYesPlatform = kalshiYesAsk < polyYesAsk ? 'Kalshi' : 'Polymarket';
    const bestNoAsk = Math.min(kalshiNoAsk, polyNoAsk);
    const bestNoPlatform = kalshiNoAsk < polyNoAsk ? 'Kalshi' : 'Polymarket';

    const totalCost = bestYesAsk + bestNoAsk;
    const spread = (1 - totalCost) * 100;

    const formatPrice = (p: number) => `${(p * 100).toFixed(1)}¢`;

    console.log(`  Best YES ask: ${formatPrice(bestYesAsk)} ${formatPrice(bestYesAsk)} (${bestYesPlatform})`);
    console.log(`  Best NO ask:  ${formatPrice(bestNoAsk)} (${bestNoPlatform})`);
    console.log(`  Total cost:   ${formatPrice(totalCost)} | Spread: ${spread.toFixed(2)}%`);

    if (totalCost < 1) {
      console.log(`  >>> ARBITRAGE OPPORTUNITY: ${spread.toFixed(2)}% profit <<<`);
    }
  }

  // ============ Arbitrage Calculation ============

  private scheduleArbitrageCheck(marketId: string, platform: Platform): void {
    // Find the pair for this market
    const pair =
      platform === 'kalshi'
        ? this.registry.getPairByKalshi(marketId)
        : this.registry.getPair(marketId);

    if (!pair) return;

    // Debounce rapid updates
    const existingTimer = this.debounceTimers.get(pair.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(pair.id);
      this.checkArbitrage(pair);
    }, this.debounceMs);

    this.debounceTimers.set(pair.id, timer);
  }

  private checkArbitrage(pair: MarketPairMapping): void {
    const kalshiOb = this.kalshiOrderbooks.get(pair.kalshiTicker);
    const polyOb = this.polymarketOrderbooks.get(pair.id);

    if (!kalshiOb || !polyOb) {
      return; // Need both orderbooks
    }

    const opportunity = this.calculateArbitrage(pair, kalshiOb, polyOb);

    if (opportunity && opportunity.spreadPercent >= this.minSpreadPercent) {
      const existing = this.activeOpportunities.get(pair.id);
      this.activeOpportunities.set(pair.id, opportunity);

      // Only emit if new or significantly changed
      if (!existing || Math.abs(existing.spreadPercent - opportunity.spreadPercent) > 0.1) {
        this.emit('opportunity', opportunity);
      }
    } else if (this.activeOpportunities.has(pair.id)) {
      // Opportunity closed
      this.activeOpportunities.delete(pair.id);
      this.emit('opportunity_closed', pair.id);
    }
  }

  private calculateArbitrage(
    pair: MarketPairMapping,
    kalshiOb: NormalizedOrderbook,
    polyOb: NormalizedOrderbook
  ): ArbitrageOpportunity | null {
    // Get best ask prices for YES and NO
    const kalshiYesAsk = kalshiOb.yesAsks[0]?.price;
    const kalshiNoAsk = kalshiOb.noAsks[0]?.price;
    const polyYesAsk = polyOb.yesAsks[0]?.price;
    const polyNoAsk = polyOb.noAsks[0]?.price;

    if (
      kalshiYesAsk === undefined ||
      kalshiNoAsk === undefined ||
      polyYesAsk === undefined ||
      polyNoAsk === undefined
    ) {
      return null;
    }

    // Check for guaranteed arbitrage:
    // Buy YES on one platform + Buy NO on other < $1

    // Strategy 1: Buy YES on Kalshi, Buy NO on Polymarket
    const cost1 = kalshiYesAsk + polyNoAsk;
    // Strategy 2: Buy YES on Polymarket, Buy NO on Kalshi
    const cost2 = polyYesAsk + kalshiNoAsk;

    let buyYesPlatform: Platform;
    let buyYesPrice: number;
    let buyNoPlatform: Platform;
    let buyNoPrice: number;
    let totalCost: number;

    if (cost1 < cost2) {
      buyYesPlatform = 'kalshi';
      buyYesPrice = kalshiYesAsk;
      buyNoPlatform = 'polymarket';
      buyNoPrice = polyNoAsk;
      totalCost = cost1;
    } else {
      buyYesPlatform = 'polymarket';
      buyYesPrice = polyYesAsk;
      buyNoPlatform = 'kalshi';
      buyNoPrice = kalshiNoAsk;
      totalCost = cost2;
    }

    const spreadPercent = (1 - totalCost) * 100;

    if (spreadPercent <= 0) {
      return null;
    }

    // Calculate max contracts (limited by liquidity)
    const buyYesSize =
      buyYesPlatform === 'kalshi'
        ? kalshiOb.yesAsks[0]?.size ?? 0
        : polyOb.yesAsks[0]?.size ?? 0;
    const buyNoSize =
      buyNoPlatform === 'kalshi'
        ? kalshiOb.noAsks[0]?.size ?? 0
        : polyOb.noAsks[0]?.size ?? 0;

    const maxContracts = Math.min(buyYesSize, buyNoSize);
    const potentialProfit = (1 - totalCost) * maxContracts;

    return {
      pairId: pair.id,
      type: 'guaranteed',
      spreadPercent,
      buyYesPlatform,
      buyYesPrice,
      buyNoPlatform,
      buyNoPrice,
      maxContracts,
      potentialProfit,
      detectedAt: new Date(),
    };
  }

  private clearAllDebounceTimers(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}

// ============ Type-safe Event Emitter ============

export interface ArbitrageEngine {
  on<E extends keyof ArbitrageEngineEvents>(
    event: E,
    listener: ArbitrageEngineEvents[E]
  ): this;
  once<E extends keyof ArbitrageEngineEvents>(
    event: E,
    listener: ArbitrageEngineEvents[E]
  ): this;
  emit<E extends keyof ArbitrageEngineEvents>(
    event: E,
    ...args: Parameters<ArbitrageEngineEvents[E]>
  ): boolean;
}
