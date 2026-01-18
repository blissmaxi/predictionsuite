/**
 * Kalshi Connector (SDK-based)
 *
 * Fetches and normalizes market data from Kalshi using the official TypeScript SDK.
 *
 * Key improvements over REST-based approach:
 * - Uses getEvents() with withNestedMarkets=true to fetch events AND markets in one call
 * - Eliminates N+1 API call problem completely
 * - Proper pagination with cursor support
 * - Type-safe with SDK types
 *
 * SDK Documentation: https://docs.kalshi.com/sdks/typescript/quickstart
 */

import {
  EventsApi,
  MarketApi,
  Configuration,
  type Market as KalshiMarket,
  type EventData as KalshiEvent,
} from 'kalshi-typescript';

import type { MarketData } from '../matching/market-matcher.js';
import { withRetry } from '../helpers/helpers.js';

// ============ Constants ============

const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_BASE_URL = 'https://kalshi.com';

// Rate limiting: delay between pagination calls (ms)
// With SDK and withNestedMarkets=true, we make far fewer calls
const API_DELAY_MS = 50;

// ============ SDK Configuration ============

const config = new Configuration({
  basePath: KALSHI_API_URL,
});

const eventsApi = new EventsApi(config);
const marketApi = new MarketApi(config);



export interface EventFetchResult {
  title: string;
  markets: MarketData[];
  imageUrl?: string;
}

// Image URL constants
const KALSHI_IMAGE_BASE = 'https://d1lvyva3zy5u58.cloudfront.net/series-images-webp';
const KALSHI_NBA_IMAGE = 'https://kalshi-public-docs.s3.us-east-1.amazonaws.com/override_images/sports/Basketball-NBA-Game.webp';

/**
 * Get the image URL for a Kalshi series.
 */
export function getKalshiImageUrl(seriesTicker: string): string {
  if (seriesTicker === 'KXNBAGAME') {
    return KALSHI_NBA_IMAGE;
  }
  return `${KALSHI_IMAGE_BASE}/${seriesTicker}.webp?size=sm`;
}

/**
 * Fetch all events and markets for a series.
 * Base function used by other fetchers.
 */
async function fetchEventsBySeries(series: string): Promise<KalshiEvent[]> {
  return await withRetry(async () => {
    const response = await eventsApi.getEvents(
      100,
      undefined,
      true,    // withNestedMarkets
      false,
      'open',
      series
    );
    return response.data.events || [];
  });
}

/**
 * Fetch a single event by ticker for scanner use.
 */
export async function fetchKalshiEvent(ticker: string): Promise<EventFetchResult | null> {
  const series = ticker.replace(/-.*$/, '');
  return fetchKalshiEventBySeries(ticker, series);
}

/**
 * Fetch a single event by ticker and series for scanner use.
 */
export async function fetchKalshiEventBySeries(
  ticker: string,
  series: string
): Promise<EventFetchResult | null> {
  try {
    const events = await fetchEventsBySeries(series);
    const event = events.find(
      (e) => e.event_ticker?.toUpperCase() === ticker.toUpperCase()
    );

    if (!event) return null;

    const markets: MarketData[] = (event.markets || [])
      .filter((m: KalshiMarket) => m.status === 'active')
      .map((m: KalshiMarket) => ({
        question: m.yes_sub_title || m.title || 'Unknown',
        yesPrice: parseFloat(m.last_price_dollars || '0') || 0,
        volume: m.volume || 0,
        ticker: m.ticker,
        endDate: (m as any).expected_expiration_time || undefined,
      }));

    const imageUrl = getKalshiImageUrl(series);

    return { title: event.title || ticker, markets, imageUrl };
  } catch (error: any) {
    const status = error?.response?.status || error?.status || 'unknown';
    console.warn(`[Kalshi] Error fetching ${ticker} (series: ${series}): HTTP ${status}`);
    return null;
  }
}

// ============ NBA Game Markets ============

/**
 * Fetch all NBA game markets from Kalshi.
 */
export async function fetchKalshiNbaMarkets(): Promise<any[]> {
  try {
    const events = await fetchEventsBySeries('KXNBAGAME');
    const allMarkets: any[] = [];

    for (const event of events) {
      const markets = (event.markets || []).filter(
        (m: KalshiMarket) => m.status === 'active'
      );
      allMarkets.push(...markets);
    }

    return allMarkets;
  } catch (error: any) {
    console.warn(`[Kalshi] Error fetching NBA markets: ${error?.message || 'unknown'}`);
    return [];
  }
}

/**
 * Filter NBA markets for a specific game ticker.
 */
export function filterKalshiNbaGame(
  allMarkets: any[],
  ticker: string
): EventFetchResult | null {
  const markets: MarketData[] = [];

  for (const market of allMarkets) {
    if (market.ticker?.startsWith(ticker)) {
      markets.push({
        question: market.yes_sub_title || market.title || 'Unknown',
        yesPrice: parseFloat(market.last_price_dollars || '0') || 0,
        volume: market.volume || 0,
        ticker: market.ticker,
        endDate: market.expected_expiration_time || undefined,
      });
    }
  }

  if (markets.length === 0) return null;

  return {
    title: `NBA Game: ${ticker}`,
    markets,
    imageUrl: getKalshiImageUrl('KXNBAGAME'),
  };
}
