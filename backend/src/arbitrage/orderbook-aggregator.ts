/**
 * Orderbook Aggregator
 *
 * Normalizes orderbooks from Kalshi and Polymarket to a unified format.
 * All prices are converted to 0-1 probability scale.
 * Output shows prices to BUY each outcome (yesAsks, noAsks).
 */

import type { OrderBookState } from '../websocket/kalshi-types.js';
import type { PolymarketOrderBookState } from '../websocket/polymarket-types.js';
import type { NormalizedOrderbook, PriceLevel } from './types.js';

export class OrderbookAggregator {
  /**
   * Normalize a Kalshi orderbook to unified format.
   *
   * Kalshi prices are in cents (0-100).
   * Output: yesAsks (price to buy YES), noAsks (price to buy NO).
   */
  normalizeKalshi(
    marketTicker: string,
    orderbook: OrderBookState
  ): NormalizedOrderbook {
    const yesAsks: PriceLevel[] = [];
    const noAsks: PriceLevel[] = [];

    // YES bids → NO asks: if someone bids X for YES, you can buy NO at (1-X)
    for (const [priceCents, size] of orderbook.yes) {
      noAsks.push({
        price: (100 - priceCents) / 100,
        size,
      });
    }

    // NO bids → YES asks: if someone bids X for NO, you can buy YES at (1-X)
    for (const [priceCents, size] of orderbook.no) {
      yesAsks.push({
        price: (100 - priceCents) / 100,
        size,
      });
    }

    // Sort ascending (best/lowest price first)
    yesAsks.sort((a, b) => a.price - b.price);
    noAsks.sort((a, b) => a.price - b.price);

    return {
      platform: 'kalshi',
      marketId: marketTicker,
      yesAsks,
      noAsks,
      updatedAt: orderbook.updatedAt,
    };
  }

  /**
   * Normalize a Polymarket orderbook to unified format.
   *
   * Polymarket prices are in tenths of cent (0-1000).
   * Each token has its own bids/asks.
   */
  normalizePolymarket(
    assetId: string,
    orderbook: PolymarketOrderBookState,
    isYesToken: boolean
  ): NormalizedOrderbook {
    const yesAsks: PriceLevel[] = [];
    const noAsks: PriceLevel[] = [];

    if (isYesToken) {
      // YES token: asks are YES asks, bids become NO asks
      for (const [priceTenths, size] of orderbook.asks) {
        yesAsks.push({
          price: priceTenths / 1000,
          size,
        });
      }
      for (const [priceTenths, size] of orderbook.bids) {
        noAsks.push({
          price: (1000 - priceTenths) / 1000,
          size,
        });
      }
    } else {
      // NO token: asks are NO asks, bids become YES asks
      for (const [priceTenths, size] of orderbook.asks) {
        noAsks.push({
          price: priceTenths / 1000,
          size,
        });
      }
      for (const [priceTenths, size] of orderbook.bids) {
        yesAsks.push({
          price: (1000 - priceTenths) / 1000,
          size,
        });
      }
    }

    // Sort ascending (best/lowest price first)
    yesAsks.sort((a, b) => a.price - b.price);
    noAsks.sort((a, b) => a.price - b.price);

    return {
      platform: 'polymarket',
      marketId: assetId,
      yesAsks,
      noAsks,
      updatedAt: orderbook.updatedAt,
    };
  }

  /**
   * Merge two Polymarket orderbooks (YES and NO tokens) into one normalized view.
   * This gives the complete picture of liquidity from both tokens.
   * Entries at the same price are consolidated (sizes summed).
   */
  mergePolymarketOrderbooks(
    yesTokenId: string,
    yesOrderbook: PolymarketOrderBookState | undefined,
    noOrderbook: PolymarketOrderBookState | undefined
  ): NormalizedOrderbook | null {
    if (!yesOrderbook && !noOrderbook) {
      return null;
    }

    // Use Maps to consolidate entries at the same price
    const yesAsksMap = new Map<number, number>(); // price -> total size
    const noAsksMap = new Map<number, number>();

    // Helper to add to a price level map
    const addToMap = (map: Map<number, number>, price: number, size: number) => {
      const existing = map.get(price) ?? 0;
      map.set(price, existing + size);
    };

    // From YES token orderbook
    if (yesOrderbook) {
      // YES asks → YES asks (direct)
      for (const [priceTenths, size] of yesOrderbook.asks) {
        addToMap(yesAsksMap, priceTenths / 1000, size);
      }
      // YES bids → NO asks (inverted)
      for (const [priceTenths, size] of yesOrderbook.bids) {
        addToMap(noAsksMap, (1000 - priceTenths) / 1000, size);
      }
    }

    // From NO token orderbook
    if (noOrderbook) {
      // NO asks → NO asks (direct)
      for (const [priceTenths, size] of noOrderbook.asks) {
        addToMap(noAsksMap, priceTenths / 1000, size);
      }
      // NO bids → YES asks (inverted)
      for (const [priceTenths, size] of noOrderbook.bids) {
        addToMap(yesAsksMap, (1000 - priceTenths) / 1000, size);
      }
    }

    // Convert maps to sorted arrays (ascending - best/lowest price first)
    const yesAsks: PriceLevel[] = Array.from(yesAsksMap.entries())
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => a.price - b.price);

    const noAsks: PriceLevel[] = Array.from(noAsksMap.entries())
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => a.price - b.price);

    const latestUpdate = this.getLatestUpdate(yesOrderbook, noOrderbook);

    return {
      platform: 'polymarket',
      marketId: yesTokenId,
      yesAsks,
      noAsks,
      updatedAt: latestUpdate,
    };
  }

  private getLatestUpdate(
    ob1: PolymarketOrderBookState | undefined,
    ob2: PolymarketOrderBookState | undefined
  ): Date {
    if (!ob1) return ob2?.updatedAt ?? new Date();
    if (!ob2) return ob1.updatedAt;
    return ob1.updatedAt > ob2.updatedAt ? ob1.updatedAt : ob2.updatedAt;
  }
}
