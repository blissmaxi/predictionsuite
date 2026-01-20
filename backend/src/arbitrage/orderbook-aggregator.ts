/**
 * Orderbook Aggregator
 *
 * Normalizes orderbooks from Kalshi and Polymarket to a unified format.
 * All prices are converted to 0-1 probability scale.
 */

import type { OrderBookState } from '../websocket/kalshi-types.js';
import type { PolymarketOrderBookState } from '../websocket/polymarket-types.js';
import type { NormalizedOrderbook, PriceLevel } from './types.js';

export class OrderbookAggregator {
  /**
   * Normalize a Kalshi orderbook to unified format.
   *
   * Kalshi prices are in cents (0-100).
   * YES bids are direct, NO bids become YES asks at (1 - price).
   */
  normalizeKalshi(
    marketTicker: string,
    orderbook: OrderBookState
  ): NormalizedOrderbook {
    const yesBids: PriceLevel[] = [];
    const yesAsks: PriceLevel[] = [];

    // YES bids: direct conversion from cents to probability
    for (const [priceCents, size] of orderbook.yes) {
      yesBids.push({
        price: priceCents / 100,
        size,
      });
    }

    // NO bids become YES asks: if someone bids X for NO,
    // you can effectively sell YES at (1 - X)
    for (const [priceCents, size] of orderbook.no) {
      yesAsks.push({
        price: (100 - priceCents) / 100,
        size,
      });
    }

    // Sort: bids descending, asks ascending (best prices first)
    yesBids.sort((a, b) => b.price - a.price);
    yesAsks.sort((a, b) => a.price - b.price);

    return {
      platform: 'kalshi',
      marketId: marketTicker,
      yesBids,
      yesAsks,
      updatedAt: orderbook.updatedAt,
    };
  }

  /**
   * Normalize a Polymarket orderbook to unified format.
   *
   * Polymarket prices are in tenths of cent (0-1000).
   * Each token has its own bids/asks. We use the YES token's orderbook.
   */
  normalizePolymarket(
    assetId: string,
    orderbook: PolymarketOrderBookState,
    isYesToken: boolean
  ): NormalizedOrderbook {
    const yesBids: PriceLevel[] = [];
    const yesAsks: PriceLevel[] = [];

    if (isYesToken) {
      // Direct YES token: bids are YES bids, asks are YES asks
      for (const [priceTenths, size] of orderbook.bids) {
        yesBids.push({
          price: priceTenths / 1000,
          size,
        });
      }
      for (const [priceTenths, size] of orderbook.asks) {
        yesAsks.push({
          price: priceTenths / 1000,
          size,
        });
      }
    } else {
      // NO token: NO bids become YES asks, NO asks become YES bids
      for (const [priceTenths, size] of orderbook.bids) {
        yesAsks.push({
          price: (1000 - priceTenths) / 1000,
          size,
        });
      }
      for (const [priceTenths, size] of orderbook.asks) {
        yesBids.push({
          price: (1000 - priceTenths) / 1000,
          size,
        });
      }
    }

    // Sort: bids descending, asks ascending (best prices first)
    yesBids.sort((a, b) => b.price - a.price);
    yesAsks.sort((a, b) => a.price - b.price);

    return {
      platform: 'polymarket',
      marketId: assetId,
      yesBids,
      yesAsks,
      updatedAt: orderbook.updatedAt,
    };
  }

  /**
   * Merge two Polymarket orderbooks (YES and NO tokens) into one normalized view.
   * This gives the complete picture of YES liquidity from both tokens.
   */
  mergePolymarketOrderbooks(
    yesTokenId: string,
    yesOrderbook: PolymarketOrderBookState | undefined,
    noOrderbook: PolymarketOrderBookState | undefined
  ): NormalizedOrderbook | null {
    if (!yesOrderbook && !noOrderbook) {
      return null;
    }

    const yesBids: PriceLevel[] = [];
    const yesAsks: PriceLevel[] = [];

    // From YES token orderbook
    if (yesOrderbook) {
      for (const [priceTenths, size] of yesOrderbook.bids) {
        yesBids.push({ price: priceTenths / 1000, size });
      }
      for (const [priceTenths, size] of yesOrderbook.asks) {
        yesAsks.push({ price: priceTenths / 1000, size });
      }
    }

    // From NO token orderbook (inverted)
    if (noOrderbook) {
      for (const [priceTenths, size] of noOrderbook.bids) {
        // NO bid at X = YES ask at (1-X)
        yesAsks.push({ price: (1000 - priceTenths) / 1000, size });
      }
      for (const [priceTenths, size] of noOrderbook.asks) {
        // NO ask at X = YES bid at (1-X)
        yesBids.push({ price: (1000 - priceTenths) / 1000, size });
      }
    }

    // Sort: bids descending, asks ascending
    yesBids.sort((a, b) => b.price - a.price);
    yesAsks.sort((a, b) => a.price - b.price);

    const latestUpdate = this.getLatestUpdate(yesOrderbook, noOrderbook);

    return {
      platform: 'polymarket',
      marketId: yesTokenId,
      yesBids,
      yesAsks,
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
