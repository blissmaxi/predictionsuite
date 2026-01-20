/**
 * Polymarket Order Book Fetcher
 *
 * Fetches order books from Polymarket's CLOB API.
 *
 * Polymarket uses separate token IDs for YES and NO outcomes.
 * Each token has its own order book that must be fetched independently.
 */

import { POLYMARKET } from '../../config/api.js';
import type { ClobOrderBook } from '../../types/polymarket.js';
import type { OrderBookLevel, UnifiedOrderBook } from '../types.js';

// ============ Public API ============

/**
 * Fetch order book for a Polymarket market.
 *
 * @param yesTokenId - CLOB token ID for YES outcome
 * @param noTokenId - CLOB token ID for NO outcome
 */
export async function fetchPolymarketOrderBook(
  yesTokenId: string,
  noTokenId: string
): Promise<UnifiedOrderBook> {
  const [yesBook, noBook] = await Promise.all([
    fetchSingleBook(yesTokenId),
    fetchSingleBook(noTokenId),
  ]);

  return {
    platform: 'polymarket',
    marketId: yesTokenId,
    yesBids: yesBook.bids,
    yesAsks: yesBook.asks,
    noBids: noBook.bids,
    noAsks: noBook.asks,
    fetchedAt: new Date(),
  };
}

// ============ Internal Helpers ============

/**
 * Fetch order book for a single Polymarket token.
 */
async function fetchSingleBook(tokenId: string): Promise<{
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}> {
  const emptyBook = { bids: [], asks: [] };

  try {
    const url = `${POLYMARKET.CLOB_API_URL}/book?token_id=${tokenId}`;
    const response = await fetch(url);

    if (!response.ok) {
      return emptyBook;
    }

    const data = (await response.json()) as ClobOrderBook;

    return {
      bids: parseOrderBookLevels(data.bids, 'descending'),
      asks: parseOrderBookLevels(data.asks, 'ascending'),
    };
  } catch {
    // Return empty book - caller handles no-liquidity case
    return emptyBook;
  }
}

/**
 * Parse Polymarket order book levels from string format.
 */
function parseOrderBookLevels(
  levels: Array<{ price: string; size: string }> | undefined,
  sortOrder: 'ascending' | 'descending'
): OrderBookLevel[] {
  if (!levels) return [];

  const parsed = levels
    .map((level) => ({
      price: parseFloat(level.price),
      size: parseFloat(level.size),
    }))
    .filter((l) => l.size > 0 && l.price > 0 && l.price < 1);

  return sortOrder === 'descending'
    ? parsed.sort((a, b) => b.price - a.price)
    : parsed.sort((a, b) => a.price - b.price);
}
