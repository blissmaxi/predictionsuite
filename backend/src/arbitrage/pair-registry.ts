/**
 * Market Pair Registry
 *
 * Maps market identifiers between Kalshi and Polymarket platforms.
 * Provides bidirectional lookup for market pairs.
 */

import type { MarketPairMapping } from './types.js';

export class MarketPairRegistry {
  private pairs = new Map<string, MarketPairMapping>();
  private kalshiIndex = new Map<string, string>(); // ticker -> pairId
  private polymarketIndex = new Map<string, string>(); // tokenId -> pairId

  /**
   * Add a market pair mapping.
   */
  addPair(mapping: MarketPairMapping): void {
    if (this.pairs.has(mapping.id)) {
      throw new Error(`Pair with id "${mapping.id}" already exists`);
    }

    this.pairs.set(mapping.id, mapping);
    this.kalshiIndex.set(mapping.kalshiTicker, mapping.id);
    this.polymarketIndex.set(mapping.polymarketYesToken, mapping.id);
    this.polymarketIndex.set(mapping.polymarketNoToken, mapping.id);
  }

  /**
   * Add multiple market pair mappings.
   */
  addPairs(mappings: MarketPairMapping[]): void {
    for (const mapping of mappings) {
      this.addPair(mapping);
    }
  }

  /**
   * Remove a market pair by id.
   */
  removePair(pairId: string): boolean {
    const pair = this.pairs.get(pairId);
    if (!pair) {
      return false;
    }

    this.pairs.delete(pairId);
    this.kalshiIndex.delete(pair.kalshiTicker);
    this.polymarketIndex.delete(pair.polymarketYesToken);
    this.polymarketIndex.delete(pair.polymarketNoToken);
    return true;
  }

  /**
   * Get pair by id.
   */
  getPair(pairId: string): MarketPairMapping | undefined {
    return this.pairs.get(pairId);
  }

  /**
   * Lookup pair by Kalshi market ticker.
   */
  getPairByKalshi(ticker: string): MarketPairMapping | undefined {
    const pairId = this.kalshiIndex.get(ticker);
    return pairId ? this.pairs.get(pairId) : undefined;
  }

  /**
   * Lookup pair by Polymarket token ID (YES or NO).
   */
  getPairByPolymarket(tokenId: string): MarketPairMapping | undefined {
    const pairId = this.polymarketIndex.get(tokenId);
    return pairId ? this.pairs.get(pairId) : undefined;
  }

  /**
   * Check if a token is a YES token for its pair.
   */
  isYesToken(tokenId: string): boolean {
    const pair = this.getPairByPolymarket(tokenId);
    return pair?.polymarketYesToken === tokenId;
  }

  /**
   * Get all registered pairs.
   */
  getAllPairs(): MarketPairMapping[] {
    return Array.from(this.pairs.values());
  }

  /**
   * Get all Kalshi tickers.
   */
  getKalshiTickers(): string[] {
    return Array.from(this.kalshiIndex.keys());
  }

  /**
   * Get all Polymarket token IDs (both YES and NO).
   */
  getPolymarketTokens(): string[] {
    return Array.from(this.polymarketIndex.keys());
  }

  /**
   * Clear all pairs.
   */
  clear(): void {
    this.pairs.clear();
    this.kalshiIndex.clear();
    this.polymarketIndex.clear();
  }

  /**
   * Get number of registered pairs.
   */
  get size(): number {
    return this.pairs.size;
  }
}
