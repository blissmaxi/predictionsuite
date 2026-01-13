/**
 * Order Book Fetcher
 *
 * Unified interface for fetching order books from Polymarket and Kalshi.
 * Normalizes data into a common format for liquidity analysis.
 */

import type { ClobOrderBook } from '../types/polymarket.js';
import type { KalshiOrderBook } from '../types/kalshi.js';

// ============ Types ============

export interface OrderBookLevel {
  price: number;  // 0-1 normalized
  size: number;   // Number of contracts available
}

export interface UnifiedOrderBook {
  platform: 'polymarket' | 'kalshi';
  marketId: string;
  yesBids: OrderBookLevel[];  // Sorted best (highest) first
  yesAsks: OrderBookLevel[];  // Sorted best (lowest) first
  noBids: OrderBookLevel[];   // Sorted best (highest) first
  noAsks: OrderBookLevel[];   // Sorted best (lowest) first
  fetchedAt: Date;
}

// ============ Config ============

const POLYMARKET_CLOB_URL = 'https://clob.polymarket.com';
const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';

// ============ Polymarket Fetching ============

/**
 * Fetch order book for a Polymarket token.
 *
 * @param tokenId The CLOB token ID (from clobTokenIds array)
 * @param side 'yes' or 'no' - which outcome this token represents
 */
export async function fetchPolymarketOrderBook(
  yesTokenId: string,
  noTokenId: string
): Promise<UnifiedOrderBook> {
  // Fetch both YES and NO order books
  const [yesBook, noBook] = await Promise.all([
    fetchPolymarketSingleBook(yesTokenId),
    fetchPolymarketSingleBook(noTokenId),
  ]);

  return {
    platform: 'polymarket',
    marketId: yesTokenId,
    // YES token: bids are people wanting to buy YES, asks are people selling YES
    yesBids: yesBook.bids,
    yesAsks: yesBook.asks,
    // NO token: bids are people wanting to buy NO, asks are people selling NO
    noBids: noBook.bids,
    noAsks: noBook.asks,
    fetchedAt: new Date(),
  };
}

async function fetchPolymarketSingleBook(tokenId: string): Promise<{
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}> {
  try {
    const response = await fetch(`${POLYMARKET_CLOB_URL}/book?token_id=${tokenId}`);

    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status}`);
    }

    const data = (await response.json()) as ClobOrderBook;

    // Parse and sort bids (highest first for buying)
    const bids: OrderBookLevel[] = (data.bids || [])
      .map(level => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      }))
      .filter(l => l.size > 0)
      .sort((a, b) => b.price - a.price);

    // Parse and sort asks (lowest first for selling)
    const asks: OrderBookLevel[] = (data.asks || [])
      .map(level => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      }))
      .filter(l => l.size > 0)
      .sort((a, b) => a.price - b.price);

    return { bids, asks };
  } catch (error) {
    // Return empty book on error
    return { bids: [], asks: [] };
  }
}

// ============ Kalshi Fetching ============

/**
 * Fetch order book for a Kalshi market.
 *
 * @param ticker The market ticker (e.g., "KXSB-26-KC")
 */
export async function fetchKalshiOrderBook(ticker: string): Promise<UnifiedOrderBook> {
  try {
    const response = await fetch(`${KALSHI_API_URL}/markets/${ticker}/orderbook`);

    if (!response.ok) {
      throw new Error(`Kalshi API error: ${response.status}`);
    }

    const data = (await response.json()) as KalshiOrderBook;

    // Kalshi provides YES and NO sides directly
    // Use dollars format (0-1 scale) if available, otherwise convert from cents
    const yesLevels = data.orderbook.yes_dollars || [];
    const noLevels = data.orderbook.no_dollars || [];

    // YES side: these are prices people are willing to pay for YES
    // In Kalshi, the order book shows bid prices (what buyers will pay)
    const yesBids: OrderBookLevel[] = yesLevels
      .map(([priceStr, qty]) => ({
        price: parseFloat(priceStr),
        size: qty,
      }))
      .filter(l => l.size > 0)
      .sort((a, b) => b.price - a.price);

    // To get YES asks, we derive from NO bids
    // If someone bids X for NO, they're effectively offering (1-X) for YES
    const yesAsks: OrderBookLevel[] = noLevels
      .map(([priceStr, qty]) => ({
        price: 1 - parseFloat(priceStr),
        size: qty,
      }))
      .filter(l => l.size > 0 && l.price > 0)
      .sort((a, b) => a.price - b.price);

    // NO side: prices people are willing to pay for NO
    const noBids: OrderBookLevel[] = noLevels
      .map(([priceStr, qty]) => ({
        price: parseFloat(priceStr),
        size: qty,
      }))
      .filter(l => l.size > 0)
      .sort((a, b) => b.price - a.price);

    // NO asks derived from YES bids
    const noAsks: OrderBookLevel[] = yesLevels
      .map(([priceStr, qty]) => ({
        price: 1 - parseFloat(priceStr),
        size: qty,
      }))
      .filter(l => l.size > 0 && l.price > 0)
      .sort((a, b) => a.price - b.price);

    return {
      platform: 'kalshi',
      marketId: ticker,
      yesBids,
      yesAsks,
      noBids,
      noAsks,
      fetchedAt: new Date(),
    };
  } catch (error) {
    // Return empty book on error
    return {
      platform: 'kalshi',
      marketId: ticker,
      yesBids: [],
      yesAsks: [],
      noBids: [],
      noAsks: [],
      fetchedAt: new Date(),
    };
  }
}

// ============ Helpers ============

/**
 * Check if an order book has any liquidity.
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
  return {
    yesBidDepth: book.yesBids.reduce((sum, l) => sum + l.size, 0),
    yesAskDepth: book.yesAsks.reduce((sum, l) => sum + l.size, 0),
    noBidDepth: book.noBids.reduce((sum, l) => sum + l.size, 0),
    noAskDepth: book.noAsks.reduce((sum, l) => sum + l.size, 0),
  };
}
