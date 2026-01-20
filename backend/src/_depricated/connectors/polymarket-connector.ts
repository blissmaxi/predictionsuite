/**
 * Polymarket Connector
 *
 * Fetches and normalizes market data from Polymarket's Gamma API.
 *
 * API Documentation: https://docs.polymarket.com/
 *
 * Key API quirks handled:
 * - Fields like `outcomes`, `outcomePrices`, `clobTokenIds` are JSON-encoded strings
 * - Prices are already in 0-1 decimal format
 * - Events contain nested markets array
 * - Volume/liquidity may be strings or numbers depending on endpoint
 */

import type { MarketData } from '../matching/market-matcher.js';

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';


export interface EventFetchResult {
  title: string;
  markets: MarketData[];
  imageUrl?: string;
}

/**
 * Fetch a single event by slug for scanner use.
 * Returns market data in the format needed for matching.
 */
export async function fetchPolymarketEvent(slug: string): Promise<EventFetchResult | null> {
  try {
    const response = await fetch(`${GAMMA_API_URL}/events?slug=${slug}`);

    if (!response.ok) {
      console.warn(`[Polymarket] Failed to fetch ${slug}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.length === 0) return null;

    const event = data[0];
    const markets: MarketData[] = (event.markets || []).map((m: any) => {
      const prices = JSON.parse(m.outcomePrices || '["0","0"]');
      const tokenIds = m.clobTokenIds ? JSON.parse(m.clobTokenIds) : undefined;
      return {
        question: m.question || m.groupItemTitle || 'Unknown',
        yesPrice: parseFloat(prices[0]) || 0,
        volume: m.volumeNum || 0,
        tokenIds,
        endDate: m.endDate || undefined,
      };
    });

    return { title: event.title, markets };
  } catch (error: any) {
    const status = error?.response?.status || error?.status || 'unknown';
    console.warn(`[Polymarket] Error fetching ${slug}: HTTP ${status}`);
    return null;
  }
}
