/**
 * Kalshi Order Book Fetcher
 *
 * Fetches order books from Kalshi's REST API.
 *
 * Kalshi's order book shows resting bids for each outcome.
 * To derive asks, we use the complement relationship:
 * - A bid of X for NO implies an ask of (1-X) for YES
 * - A bid of X for YES implies an ask of (1-X) for NO
 */

import { KALSHI } from '../../config/api.js';
import type { KalshiOrderBook } from '../../types/kalshi.js';
import type { OrderBookLevel, UnifiedOrderBook } from '../types.js';
import { createEmptyOrderBook } from '../types.js';

// ============ Public API ============

/**
 * Fetch order book for a Kalshi market.
 *
 * @param ticker - Market ticker (e.g., "KXSB-26-KC")
 */
export async function fetchKalshiOrderBook(ticker: string): Promise<UnifiedOrderBook> {
  const emptyBook = createEmptyOrderBook('kalshi', ticker);

  try {
    const url = `${KALSHI.API_URL}/markets/${ticker}/orderbook`;
    const response = await fetch(url);

    if (!response.ok) {
      // For rate limits (429), throw an error that can be retried
      if (response.status === 429) {
        const error = new Error(`Rate limited fetching Kalshi order book for ${ticker}`);
        (error as any).status = 429;
        throw error;
      }
      // For other errors, return empty book
      return emptyBook;
    }

    const data = (await response.json()) as KalshiOrderBook;
    const yesLevels = data.orderbook.yes_dollars || [];
    const noLevels = data.orderbook.no_dollars || [];

    return {
      platform: 'kalshi',
      marketId: ticker,
      yesBids: parseKalshiLevels(yesLevels, 'direct', 'descending'),
      yesAsks: parseKalshiLevels(noLevels, 'complement', 'ascending'),
      noBids: parseKalshiLevels(noLevels, 'direct', 'descending'),
      noAsks: parseKalshiLevels(yesLevels, 'complement', 'ascending'),
      fetchedAt: new Date(),
    };
  } catch (error: any) {
    // Re-throw rate limit errors for retry logic
    if (error?.status === 429) {
      throw error;
    }
    // Return empty book for other errors - caller handles no-liquidity case
    return emptyBook;
  }
}

// ============ Internal Helpers ============

/**
 * Parse Kalshi order book levels.
 *
 * @param levels - Raw levels as [priceString, quantity] tuples
 * @param priceMode - 'direct' uses price as-is, 'complement' uses (1 - price)
 * @param sortOrder - How to sort the result
 */
function parseKalshiLevels(
  levels: Array<[string, number]>,
  priceMode: 'direct' | 'complement',
  sortOrder: 'ascending' | 'descending'
): OrderBookLevel[] {
  const parsed = levels
    .map(([priceStr, qty]) => {
      const rawPrice = parseFloat(priceStr);
      const price = priceMode === 'complement' ? 1 - rawPrice : rawPrice;
      return { price, size: qty };
    })
    .filter((l) => l.size > 0 && l.price > 0 && l.price < 1);

  return sortOrder === 'descending'
    ? parsed.sort((a, b) => b.price - a.price)
    : parsed.sort((a, b) => a.price - b.price);
}
