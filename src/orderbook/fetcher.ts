/**
 * Order Book Fetcher
 *
 * Unified interface for fetching order books from Polymarket and Kalshi.
 * Normalizes data into a common format for liquidity analysis.
 *
 * Key concepts:
 * - Bids: Prices buyers are willing to pay (sorted highest first)
 * - Asks: Prices sellers are offering (sorted lowest first)
 * - YES/NO: Binary outcome sides of a prediction market
 */

import { POLYMARKET, KALSHI } from '../config/api.js';
import { ApiError, getErrorMessage } from '../errors/index.js';
import type { ClobOrderBook } from '../types/polymarket.js';
import type { KalshiOrderBook } from '../types/kalshi.js';

// ============ Types ============

export interface OrderBookLevel {
  /** Price in 0-1 scale (probability) */
  price: number;
  /** Number of contracts available at this price */
  size: number;
}

export interface UnifiedOrderBook {
  platform: 'polymarket' | 'kalshi';
  marketId: string;
  /** Bids for YES outcome (sorted highest first) */
  yesBids: OrderBookLevel[];
  /** Asks for YES outcome (sorted lowest first) */
  yesAsks: OrderBookLevel[];
  /** Bids for NO outcome (sorted highest first) */
  noBids: OrderBookLevel[];
  /** Asks for NO outcome (sorted lowest first) */
  noAsks: OrderBookLevel[];
  fetchedAt: Date;
}

// ============ Polymarket ============

/**
 * Fetch order book for a Polymarket market.
 *
 * Polymarket uses separate token IDs for YES and NO outcomes.
 * Each token has its own order book that must be fetched independently.
 *
 * @param yesTokenId - CLOB token ID for YES outcome
 * @param noTokenId - CLOB token ID for NO outcome
 */
export async function fetchPolymarketOrderBook(
  yesTokenId: string,
  noTokenId: string
): Promise<UnifiedOrderBook> {
  const [yesBook, noBook] = await Promise.all([
    fetchPolymarketSingleBook(yesTokenId),
    fetchPolymarketSingleBook(noTokenId),
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

/**
 * Fetch order book for a single Polymarket token.
 */
async function fetchPolymarketSingleBook(tokenId: string): Promise<{
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}> {
  const emptyBook = { bids: [], asks: [] };

  try {
    const url = `${POLYMARKET.CLOB_API_URL}/book?token_id=${tokenId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new ApiError(
        `Failed to fetch order book`,
        'polymarket',
        response.status,
        { tokenId }
      );
    }

    const data = (await response.json()) as ClobOrderBook;

    return {
      bids: parseOrderBookLevels(data.bids, 'descending'),
      asks: parseOrderBookLevels(data.asks, 'ascending'),
    };
  } catch (error) {
    // Silently return empty book - caller handles no-liquidity case
    return emptyBook;
  }
}

// ============ Kalshi ============

/**
 * Fetch order book for a Kalshi market.
 *
 * Kalshi's order book shows resting bids for each outcome.
 * To derive asks, we use the complement relationship:
 * - A bid of X for NO implies an ask of (1-X) for YES
 * - A bid of X for YES implies an ask of (1-X) for NO
 *
 * @param ticker - Market ticker (e.g., "KXSB-26-KC")
 */
export async function fetchKalshiOrderBook(ticker: string): Promise<UnifiedOrderBook> {
  const emptyBook = createEmptyOrderBook('kalshi', ticker);

  try {
    const url = `${KALSHI.API_URL}/markets/${ticker}/orderbook`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new ApiError(
        `Failed to fetch order book`,
        'kalshi',
        response.status,
        { ticker }
      );
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
  } catch (error) {
    // Silently return empty book - caller handles no-liquidity case
    return emptyBook;
  }
}

// ============ Parsing Helpers ============

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

/**
 * Create an empty order book (used for error cases).
 */
function createEmptyOrderBook(
  platform: 'polymarket' | 'kalshi',
  marketId: string
): UnifiedOrderBook {
  return {
    platform,
    marketId,
    yesBids: [],
    yesAsks: [],
    noBids: [],
    noAsks: [],
    fetchedAt: new Date(),
  };
}

// ============ Analysis Helpers ============

/**
 * Check if an order book has any liquidity on any side.
 */
export function hasLiquidity(book: UnifiedOrderBook): boolean {
  return (
    book.yesBids.length > 0 ||
    book.yesAsks.length > 0 ||
    book.noBids.length > 0 ||
    book.noAsks.length > 0
  );
}

/**
 * Get best bid/ask prices from an order book.
 * Returns null for sides with no liquidity.
 */
export function getBestPrices(book: UnifiedOrderBook): {
  yesBestBid: number | null;
  yesBestAsk: number | null;
  noBestBid: number | null;
  noBestAsk: number | null;
} {
  return {
    yesBestBid: book.yesBids[0]?.price ?? null,
    yesBestAsk: book.yesAsks[0]?.price ?? null,
    noBestBid: book.noBids[0]?.price ?? null,
    noBestAsk: book.noAsks[0]?.price ?? null,
  };
}

/**
 * Calculate total depth (volume) at each side.
 */
export function getDepth(book: UnifiedOrderBook): {
  yesBidDepth: number;
  yesAskDepth: number;
  noBidDepth: number;
  noAskDepth: number;
} {
  const sumSize = (levels: OrderBookLevel[]) =>
    levels.reduce((sum, l) => sum + l.size, 0);

  return {
    yesBidDepth: sumSize(book.yesBids),
    yesAskDepth: sumSize(book.yesAsks),
    noBidDepth: sumSize(book.noBids),
    noAskDepth: sumSize(book.noAsks),
  };
}

/**
 * Calculate the spread between best bid and ask for an outcome.
 * Returns null if either side has no liquidity.
 */
export function getSpread(
  book: UnifiedOrderBook,
  outcome: 'yes' | 'no'
): number | null {
  const bids = outcome === 'yes' ? book.yesBids : book.noBids;
  const asks = outcome === 'yes' ? book.yesAsks : book.noAsks;

  if (bids.length === 0 || asks.length === 0) return null;

  return asks[0].price - bids[0].price;
}
