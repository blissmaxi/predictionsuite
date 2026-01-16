/**
 * Scanner Service
 *
 * Orchestrates the full arbitrage scanning pipeline.
 * Wraps the existing scanner logic for use by the API.
 */

import {
  EventsApi,
  Configuration,
  type Market as KalshiMarket,
} from 'kalshi-typescript';
import {
  loadMappings,
  generateDynamicMatches,
  generateYearlyMatches,
  type MatchResult,
} from '../../matching/catalog-matcher.js';
import {
  matchMarketsWithinEvent,
  type MarketPair,
  type MarketData,
} from '../../matching/market-matcher.js';
import {
  findArbitrageOpportunities,
  createOpportunitiesFromAllPairs,
  type ArbitrageOpportunity,
} from '../../arbitrage/calculator.js';
import {
  fetchPolymarketOrderBook,
  fetchKalshiOrderBook,
} from '../../orderbook/fetcher.js';
import {
  analyzeLiquidity,
  type LiquidityAnalysis,
} from '../../arbitrage/liquidity-analyzer.js';
import { POLYMARKET, KALSHI, SCANNER } from '../../config/api.js';
import {
  fetchNbaGameMatches,
  type NbaGameMatch,
} from '../../matching/nba-game-matcher.js';

// ============ Types ============

export interface MatchedEvent {
  name: string;
  category: string;
  type: string;
  polymarketSlug: string;
  kalshiTicker: string;
  kalshiSeries?: string;
  kalshiImageUrl?: string;
  date?: Date;
  polymarket: {
    found: boolean;
    title?: string;
    markets?: MarketData[];
  };
  kalshi: {
    found: boolean;
    title?: string;
    markets?: MarketData[];
  };
  marketPairs?: MarketPair[];
}

export interface OpportunityWithLiquidity {
  opportunity: ArbitrageOpportunity;
  liquidity: LiquidityAnalysis | null;
}

export interface ScanResult {
  events: MatchedEvent[];
  opportunities: OpportunityWithLiquidity[];
  scannedAt: Date;
}

// ============ Configuration ============

const kalshiConfig = new Configuration({ basePath: KALSHI.API_URL });
const kalshiEventsApi = new EventsApi(kalshiConfig);
const CURRENT_YEAR = new Date().getFullYear();

// ============ Cache ============

let cachedResult: ScanResult | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

// ============ Scan Lock ============
// Prevents multiple concurrent scans - subsequent requests wait for the ongoing scan

let scanInProgress: Promise<ScanResult> | null = null;

// ============ Utility ============

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry wrapper for Kalshi requests (handles connection-based rate limiting)
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 100
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error?.response?.status || error?.status;
      if (status === 429 && attempt < maxRetries - 1) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const waitMs = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[Retry] Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await delay(waitMs);
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

// ============ Platform Fetchers ============

interface EventFetchResult {
  title: string;
  markets: MarketData[];
  imageUrl?: string;
}

// ============ Kalshi Image URLs ============

const KALSHI_IMAGE_BASE = 'https://d1lvyva3zy5u58.cloudfront.net/series-images-webp';
const KALSHI_NBA_IMAGE = 'https://kalshi-public-docs.s3.us-east-1.amazonaws.com/override_images/sports/Basketball-NBA-Game.webp';

function getKalshiImageUrl(seriesTicker: string): string {
  // NBA games use a generic basketball image
  if (seriesTicker === 'KXNBAGAME') {
    return KALSHI_NBA_IMAGE;
  }
  // Other series use their series ticker
  return `${KALSHI_IMAGE_BASE}/${seriesTicker}.webp?size=sm`;
}

async function fetchPolymarketEvent(slug: string): Promise<EventFetchResult | null> {
  try {
    const response = await fetch(`${POLYMARKET.GAMMA_API_URL}/events?slug=${slug}`);

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
        endDate: m.endDate || undefined,  // ISO date string
      };
    });

    return { title: event.title, markets };
  } catch (error: any) {
    const status = error?.response?.status || error?.status || 'unknown';
    console.warn(`[Polymarket] Error fetching ${slug}: HTTP ${status}`);
    return null;
  }
}

async function fetchKalshiEvent(ticker: string): Promise<EventFetchResult | null> {
  const series = ticker.replace(/-.*$/, '');
  return fetchKalshiEventBySeries(ticker, series);
}

async function fetchKalshiEventBySeries(
  ticker: string,
  series: string
): Promise<EventFetchResult | null> {
  try {
    return await withRetry(async () => {
      const response = await kalshiEventsApi.getEvents(
        100,
        undefined,
        true,
        false,
        'open',
        series
      );

      const events = response.data.events || [];
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
          endDate: (m as any).expected_expiration_time || undefined,  // ISO date string
        }));

      // Construct image URL from series ticker
      const imageUrl = getKalshiImageUrl(series);

      return { title: event.title || ticker, markets, imageUrl };
    });
  } catch (error: any) {
    const status = error?.response?.status || error?.status || 'unknown';
    console.warn(`[Kalshi] Error fetching ${ticker} (series: ${series}): HTTP ${status}`);
    return null;
  }
}

// Cache for Kalshi NBA markets (fetched once per scan)
let kalshiNbaMarketsCache: any[] | null = null;

async function fetchAllKalshiNbaMarkets(): Promise<any[]> {
  if (kalshiNbaMarketsCache !== null) {
    return kalshiNbaMarketsCache;
  }

  try {
    const markets = await withRetry(async () => {
      const response = await fetch(
        `${KALSHI.API_URL}/markets?series_ticker=KXNBAGAME&limit=100`
      );

      if (!response.ok) {
        if (response.status === 429) {
          const error = new Error(`HTTP 429`);
          (error as any).status = 429;
          throw error;
        }
        console.warn(`[Kalshi] Failed to fetch NBA markets: HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      return data.markets || [];
    });

    kalshiNbaMarketsCache = markets;
    return markets;
  } catch (error: any) {
    console.warn(`[Kalshi] Error fetching NBA markets: ${error?.message || 'unknown'}`);
    return [];
  }
}

function filterKalshiNbaGame(allMarkets: any[], ticker: string): EventFetchResult | null {
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

// ============ Event Processing ============

// OPTIMIZED: Polymarket can handle many parallel requests, Kalshi is connection-limited
// Strategy: Batch Polymarket requests in parallel, process Kalshi sequentially

function buildMatchedEvent(
  match: MatchResult,
  polyData: EventFetchResult | null,
  kalshiData: EventFetchResult | null
): MatchedEvent {
  let marketPairs: MarketPair[] | undefined;
  if (polyData && kalshiData) {
    const pairs = matchMarketsWithinEvent(
      polyData.markets,
      kalshiData.markets,
      match.category,
      match.name
    );
    // Add category, imageUrl, slug, and seriesTicker to each pair
    marketPairs = pairs.map((pair) => ({
      ...pair,
      category: match.category,
      polymarket: {
        ...pair.polymarket,
        slug: match.polymarketSlug,
      },
      kalshi: {
        ...pair.kalshi,
        seriesTicker: match.kalshiSeries || match.kalshiTicker.replace(/-.*$/, ''),
        imageUrl: kalshiData.imageUrl,
      },
    }));
  }

  return {
    name: match.name,
    category: match.category,
    type: match.type,
    polymarketSlug: match.polymarketSlug,
    kalshiTicker: match.kalshiTicker,
    kalshiSeries: match.kalshiSeries,
    kalshiImageUrl: kalshiData?.imageUrl,
    date: match.date,
    polymarket: {
      found: !!polyData,
      title: polyData?.title,
      markets: polyData?.markets,
    },
    kalshi: {
      found: !!kalshiData,
      title: kalshiData?.title,
      markets: kalshiData?.markets,
    },
    marketPairs,
  };
}

async function processYearlyEvents(): Promise<MatchedEvent[]> {
  const matches = generateYearlyMatches(CURRENT_YEAR);
  if (matches.length === 0) return [];

  // OPTIMIZED: Fetch all Polymarket events in parallel (very permissive rate limits)
  const polyPromises = matches.map((m) => fetchPolymarketEvent(m.polymarketSlug));
  const polyResults = await Promise.all(polyPromises);

  // Fetch Kalshi events sequentially (connection-limited, but no delay needed)
  const kalshiResults: (EventFetchResult | null)[] = [];
  for (const match of matches) {
    const result = await fetchKalshiEventBySeries(
      match.kalshiTicker,
      match.kalshiSeries || match.kalshiTicker.replace(/-.*$/, '')
    );
    kalshiResults.push(result);
  }

  // Combine results
  return matches.map((match, i) =>
    buildMatchedEvent(match, polyResults[i], kalshiResults[i])
  );
}

async function processDynamicEvents(): Promise<MatchedEvent[]> {
  // Collect all matches first
  const allMatches: MatchResult[] = [];
  for (let dayOffset = 0; dayOffset < SCANNER.DYNAMIC_SCAN_DAYS; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    allMatches.push(...generateDynamicMatches(date));
  }

  if (allMatches.length === 0) return [];

  // OPTIMIZED: Fetch all Polymarket events in parallel
  const polyPromises = allMatches.map((m) => fetchPolymarketEvent(m.polymarketSlug));
  const polyResults = await Promise.all(polyPromises);

  // Fetch Kalshi events sequentially (no delay needed)
  const kalshiResults: (EventFetchResult | null)[] = [];
  for (const match of allMatches) {
    const result = await fetchKalshiEvent(match.kalshiTicker);
    kalshiResults.push(result);
  }

  // Combine results
  return allMatches.map((match, i) =>
    buildMatchedEvent(match, polyResults[i], kalshiResults[i])
  );
}

async function processNbaGames(): Promise<MatchedEvent[]> {
  const today = new Date();
  const endDate = new Date();
  endDate.setDate(today.getDate() + SCANNER.DYNAMIC_SCAN_DAYS);

  const games = await fetchNbaGameMatches(today, endDate);
  if (games.length === 0) return [];

  // OPTIMIZED: Fetch Polymarket events in parallel + Kalshi NBA markets once
  const [polyResults, allKalshiNbaMarkets] = await Promise.all([
    Promise.all(games.map((g) => fetchPolymarketEvent(g.polymarketSlug))),
    fetchAllKalshiNbaMarkets(),
  ]);

  // Filter Kalshi markets for each game (no API calls, just filtering)
  const kalshiResults = games.map((game) =>
    filterKalshiNbaGame(allKalshiNbaMarkets, game.kalshiTicker)
  );

  // Process and combine results
  const results: MatchedEvent[] = [];
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const polyData = polyResults[i];
    const kalshiData = kalshiResults[i];

    let marketPairs: MarketPair[] | undefined;
    if (polyData && kalshiData) {
      marketPairs = matchNbaGameMarkets(
        polyData.markets,
        kalshiData.markets,
        game,
        kalshiData.imageUrl,
        game.polymarketSlug
      );
    }

    results.push({
      name: `${game.awayTeam} @ ${game.homeTeam}`,
      category: 'nba_game',
      type: 'dynamic',
      polymarketSlug: game.polymarketSlug,
      kalshiTicker: game.kalshiTicker,
      kalshiSeries: game.kalshiSeries,
      kalshiImageUrl: kalshiData?.imageUrl,
      date: game.date,
      polymarket: {
        found: !!polyData,
        title: polyData?.title,
        markets: polyData?.markets,
      },
      kalshi: {
        found: !!kalshiData,
        title: kalshiData?.title,
        markets: kalshiData?.markets,
      },
      marketPairs,
    });
  }

  return results;
}

function matchNbaGameMarkets(
  polyMarkets: MarketData[],
  kalshiMarkets: MarketData[],
  game: NbaGameMatch,
  imageUrl?: string,
  polymarketSlug?: string
): MarketPair[] {
  const pairs: MarketPair[] = [];

  // Find the FULL GAME winner market - exclude props, spreads, totals, and period-specific markets
  // Helper to check for whole word match (avoids "Thunder" matching "under")
  const hasWord = (text: string, word: string): boolean => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(text);
  };

  const polyMoneyline = polyMarkets.find((m) => {
    const q = m.question?.toLowerCase() || '';
    return (
      q.includes('vs.') &&
      // Exclude spread/totals/props (use word boundary for "over"/"under" to avoid matching "Thunder")
      !q.includes('spread') &&
      !q.includes('o/u') &&
      !hasWord(q, 'over') &&
      !hasWord(q, 'under') &&
      !q.includes('total') &&
      !q.includes('points') &&
      !q.includes('rebounds') &&
      !q.includes('assists') &&
      !q.includes('steals') &&
      !q.includes('blocks') &&
      !hasWord(q, 'three') &&
      !q.includes('3-pointer') &&
      // Exclude period-specific markets (quarters, halves, 1H/2H)
      !q.includes('quarter') &&
      !q.includes('half') &&
      !q.includes('1st') &&
      !q.includes('2nd') &&
      !q.includes('3rd') &&
      !q.includes('4th') &&
      !hasWord(q, 'first') &&
      !hasWord(q, 'second') &&
      !q.includes('1h') &&
      !q.includes('2h') &&
      // Exclude sub-markets (e.g., "Team vs Team: 1H Moneyline")
      !q.includes('moneyline')
    );
  });

  if (!polyMoneyline) {
    // console.log(`[NBA Match] No moneyline market found for ${game.awayTeam} @ ${game.homeTeam}`);
    // console.log(`[NBA Match] Available markets: ${polyMarkets.map(m => m.question).join(', ')}`);
    return pairs;
  }

  // console.log(`[NBA Match] Matched moneyline: "${polyMoneyline.question}" with yesPrice=${polyMoneyline.yesPrice}`);

  const awayMarket = kalshiMarkets.find((m) =>
    m.ticker?.endsWith(`-${game.awayCode.toUpperCase()}`)
  );
  const homeMarket = kalshiMarkets.find((m) =>
    m.ticker?.endsWith(`-${game.homeCode.toUpperCase()}`)
  );

  if (!awayMarket || !homeMarket) return pairs;

  // IMPORTANT: Determine which team is listed FIRST in the Polymarket question
  // prices[0] (yesPrice) corresponds to the first team listed, not necessarily the away team
  const question = polyMoneyline.question?.toLowerCase() || '';
  const awayTeamLower = game.awayTeam.toLowerCase();
  const homeTeamLower = game.homeTeam.toLowerCase();

  // Extract city names and nicknames for matching
  const awayParts = awayTeamLower.split(' ');
  const homeParts = homeTeamLower.split(' ');
  const awayCity = awayParts.slice(0, -1).join(' '); // "san antonio"
  const homeCity = homeParts.slice(0, -1).join(' '); // "oklahoma city"
  const awayNickname = awayParts[awayParts.length - 1]; // "spurs"
  const homeNickname = homeParts[homeParts.length - 1]; // "thunder"

  // Try to find team positions using multiple strategies
  function findTeamPosition(team: string, city: string, nickname: string, code: string): number {
    // Try full team name first
    let pos = question.indexOf(team);
    if (pos >= 0) return pos;

    // Try city name
    pos = question.indexOf(city);
    if (pos >= 0) return pos;

    // Try nickname
    pos = question.indexOf(nickname);
    if (pos >= 0) return pos;

    // Try team code (e.g., "sas", "okc")
    pos = question.indexOf(code.toLowerCase());
    if (pos >= 0) return pos;

    return -1;
  }

  const awayPos = findTeamPosition(awayTeamLower, awayCity, awayNickname, game.awayCode);
  const homePos = findTeamPosition(homeTeamLower, homeCity, homeNickname, game.homeCode);

  // Determine if away team appears first in the question
  // If away team is first, yesPrice = away team's probability
  // If home team is first, yesPrice = home team's probability
  let awayIsFirst: boolean;
  if (awayPos >= 0 && homePos >= 0) {
    awayIsFirst = awayPos < homePos;
  } else if (awayPos >= 0) {
    awayIsFirst = true; // Only found away team
  } else if (homePos >= 0) {
    awayIsFirst = false; // Only found home team
  } else {
    // Couldn't find either team - this is a problem, log and default
    // console.log(`[NBA Match] WARNING: Could not find team positions in question "${question}"`);
    // console.log(`[NBA Match] Looking for: away="${awayTeamLower}" (${awayCity}/${awayNickname}/${game.awayCode})`);
    // console.log(`[NBA Match] Looking for: home="${homeTeamLower}" (${homeCity}/${homeNickname}/${game.homeCode})`);
    awayIsFirst = true; // Default assumption
  }

  // console.log(`[NBA Match] Team order: awayPos=${awayPos}, homePos=${homePos}, awayIsFirst=${awayIsFirst}`);

  let awayPolyYes: number;
  let homePolyYes: number;

  if (awayIsFirst) {
    // Away team is listed first, so prices[0] (yesPrice) is for away team
    awayPolyYes = polyMoneyline.yesPrice;
    homePolyYes = 1 - polyMoneyline.yesPrice;
  } else {
    // Home team is listed first, so prices[0] (yesPrice) is for home team
    homePolyYes = polyMoneyline.yesPrice;
    awayPolyYes = 1 - polyMoneyline.yesPrice;
  }

  // console.log(`[NBA Match] Polymarket prices: ${game.awayTeam}=${(awayPolyYes * 100).toFixed(1)}¢, ${game.homeTeam}=${(homePolyYes * 100).toFixed(1)}¢`);
  // console.log(`[NBA Match] Kalshi prices: ${game.awayTeam}=${(awayMarket.yesPrice * 100).toFixed(1)}¢, ${game.homeTeam}=${(homeMarket.yesPrice * 100).toFixed(1)}¢`);

  const awayPolyNo = 1 - awayPolyYes;
  const awayKalshiYes = awayMarket.yesPrice;
  const awayKalshiNo = 1 - awayKalshiYes;
  const awaySpread = Math.abs(awayPolyYes - awayKalshiYes);

  // IMPORTANT: Token selection for order book fetching
  // tokenIds[0] = first team in question, tokenIds[1] = second team in question
  // We need to pass [yesTokenId, noTokenId] for each team correctly
  const originalTokenIds = polyMoneyline.tokenIds;
  let awayTokenIds: string[] | undefined;
  let homeTokenIds: string[] | undefined;

  if (originalTokenIds && originalTokenIds.length >= 2) {
    if (awayIsFirst) {
      // Away team is first in question: tokenIds[0] = away YES, tokenIds[1] = home YES (away NO)
      awayTokenIds = [originalTokenIds[0], originalTokenIds[1]];
      homeTokenIds = [originalTokenIds[1], originalTokenIds[0]];
    } else {
      // Home team is first in question: tokenIds[0] = home YES, tokenIds[1] = away YES (home NO)
      awayTokenIds = [originalTokenIds[1], originalTokenIds[0]];
      homeTokenIds = [originalTokenIds[0], originalTokenIds[1]];
    }
    // console.log(`[NBA Match] Token assignment: awayIsFirst=${awayIsFirst}`);
    // console.log(`[NBA Match] Away (${game.awayTeam}) tokens: YES=${awayTokenIds[0].slice(-8)}, NO=${awayTokenIds[1].slice(-8)}`);
    // console.log(`[NBA Match] Home (${game.homeTeam}) tokens: YES=${homeTokenIds[0].slice(-8)}, NO=${homeTokenIds[1].slice(-8)}`);
  }

  pairs.push({
    matchedEntity: game.awayTeam,
    eventName: `NBA: ${game.awayCode.toUpperCase()} @ ${game.homeCode.toUpperCase()}`,
    category: 'nba_game',
    polymarket: {
      question: `${game.awayTeam} wins`,
      yesPrice: awayPolyYes,
      noPrice: awayPolyNo,
      tokenIds: awayTokenIds,
      slug: polymarketSlug,
      endDate: polyMoneyline?.endDate,
    },
    kalshi: {
      question: awayMarket.question,
      yesPrice: awayKalshiYes,
      noPrice: awayKalshiNo,
      ticker: awayMarket.ticker,
      seriesTicker: 'KXNBAGAME',
      imageUrl,
      endDate: awayMarket.endDate,
    },
    confidence: 1.0,
    spread: awaySpread,
  });

  // homePolyYes is already calculated above based on question order
  const homePolyNo = 1 - homePolyYes;
  const homeKalshiYes = homeMarket.yesPrice;
  const homeKalshiNo = 1 - homeKalshiYes;
  const homeSpread = Math.abs(homePolyYes - homeKalshiYes);

  pairs.push({
    matchedEntity: game.homeTeam,
    eventName: `NBA: ${game.awayCode.toUpperCase()} @ ${game.homeCode.toUpperCase()}`,
    category: 'nba_game',
    polymarket: {
      question: `${game.homeTeam} wins`,
      yesPrice: homePolyYes,
      noPrice: homePolyNo,
      tokenIds: homeTokenIds,
      slug: polymarketSlug,
      endDate: polyMoneyline?.endDate,
    },
    kalshi: {
      question: homeMarket.question,
      yesPrice: homeKalshiYes,
      noPrice: homeKalshiNo,
      ticker: homeMarket.ticker,
      seriesTicker: 'KXNBAGAME',
      imageUrl,
      endDate: homeMarket.endDate,
    },
    confidence: 1.0,
    spread: homeSpread,
  });

  return pairs;
}

// ============ Liquidity Analysis ============

// OPTIMIZED: Batch Polymarket order books (parallel), batch Kalshi with limited concurrency
const KALSHI_CONCURRENCY = 4; // Kalshi limits to ~4 concurrent connections

async function analyzeAllOpportunitiesLiquidity(
  opportunities: ArbitrageOpportunity[]
): Promise<Map<ArbitrageOpportunity, LiquidityAnalysis | null>> {
  const results = new Map<ArbitrageOpportunity, LiquidityAnalysis | null>();

  // Filter opportunities that have required data
  const validOpps = opportunities.filter((opp) => {
    const polyTokenIds = opp.pair.polymarket.tokenIds;
    const kalshiTicker = opp.pair.kalshi.ticker;
    return polyTokenIds && polyTokenIds.length >= 2 && kalshiTicker;
  });

  // Initialize results for invalid opportunities
  for (const opp of opportunities) {
    if (!validOpps.includes(opp)) {
      results.set(opp, null);
    }
  }

  if (validOpps.length === 0) return results;

  // OPTIMIZED: Fetch all Polymarket order books in parallel (very permissive)
  const polyPromises = validOpps.map(async (opp) => {
    const tokenIds = opp.pair.polymarket.tokenIds!;
    try {
      return await fetchPolymarketOrderBook(tokenIds[0], tokenIds[1]);
    } catch (error: any) {
      console.warn(`[Liquidity] Polymarket error for ${opp.pair.matchedEntity}: ${error?.message || 'unknown'}`);
      return null;
    }
  });
  const polyBooks = await Promise.all(polyPromises);

  // OPTIMIZED: Fetch Kalshi order books with limited concurrency (max 4 parallel)
  const kalshiBooks: (Awaited<ReturnType<typeof fetchKalshiOrderBook>> | null)[] = [];
  for (let i = 0; i < validOpps.length; i += KALSHI_CONCURRENCY) {
    const batch = validOpps.slice(i, i + KALSHI_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (opp) => {
        try {
          return await withRetry(() => fetchKalshiOrderBook(opp.pair.kalshi.ticker!));
        } catch (error: any) {
          console.warn(`[Liquidity] Kalshi error for ${opp.pair.matchedEntity}: ${error?.message || 'unknown'}`);
          return null;
        }
      })
    );
    kalshiBooks.push(...batchResults);
  }

  // Analyze liquidity for each opportunity
  for (let i = 0; i < validOpps.length; i++) {
    const opp = validOpps[i];
    const polyBook = polyBooks[i];
    const kalshiBook = kalshiBooks[i];

    if (polyBook && kalshiBook) {
      try {
        const analysis = analyzeLiquidity(opp, polyBook, kalshiBook);
        results.set(opp, analysis);
      } catch (error: any) {
        console.warn(`[Liquidity] Analysis error for ${opp.pair.matchedEntity}: ${error?.message || 'unknown'}`);
        results.set(opp, null);
      }
    } else {
      results.set(opp, null);
    }
  }

  return results;
}

// ============ Main Scan Function ============

export async function runScan(forceRefresh = false): Promise<ScanResult> {
  // Check cache first
  const now = Date.now();
  if (!forceRefresh && cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult;
  }

  // If a scan is already in progress, wait for it instead of starting another
  if (scanInProgress) {
    console.log('[ScannerService] Scan already in progress, waiting...');
    return scanInProgress;
  }

  // Start a new scan and track it
  scanInProgress = performScan();

  try {
    const result = await scanInProgress;
    return result;
  } finally {
    scanInProgress = null;
  }
}

async function performScan(): Promise<ScanResult> {
  const now = Date.now();
  console.log(`[ScannerService: ${new Date().toISOString()}] Running optimized scan...`);

  // Clear per-scan caches
  kalshiNbaMarketsCache = null;

  // Load mappings
  loadMappings();

  // OPTIMIZED FETCHING STRATEGY:
  // - Polymarket: Fetch all events in parallel (very permissive rate limits)
  // - Kalshi: Fetch events sequentially (connection-limited to ~4-5 concurrent)
  // - No artificial delays - Kalshi limits are connection-based, not throughput-based
  const yearlyEvents = await processYearlyEvents();
  const dynamicEvents = await processDynamicEvents();
  const nbaGames = await processNbaGames();

  const allEvents = [...yearlyEvents, ...dynamicEvents, ...nbaGames];

  // Detailed logging to debug fluctuations
  const yearlyBoth = yearlyEvents.filter((e) => e.polymarket.found && e.kalshi.found);
  const dynamicBoth = dynamicEvents.filter((e) => e.polymarket.found && e.kalshi.found);
  const nbaBoth = nbaGames.filter((e) => e.polymarket.found && e.kalshi.found);

  console.log(`[ScannerService: ${new Date().toISOString()}] Event breakdown:`);
  console.log(`  - Yearly: ${yearlyEvents.length} total, ${yearlyBoth.length} on both platforms`);
  console.log(`  - Dynamic: ${dynamicEvents.length} total, ${dynamicBoth.length} on both platforms`);
  console.log(`  - NBA Games: ${nbaGames.length} total, ${nbaBoth.length} on both platforms`);

  // Collect market pairs from events found on both platforms
  const bothPlatforms = allEvents.filter((e) => e.polymarket.found && e.kalshi.found);
  const allMarketPairs = bothPlatforms.flatMap((e) => e.marketPairs || []);

  console.log(`[ScannerService: ${new Date().toISOString()}] Market pairs: ${allMarketPairs.length} from ${bothPlatforms.length} events`);

  // Create opportunities for ALL matched market pairs (including those without arbitrage)
  const rawOpportunities = createOpportunitiesFromAllPairs(allMarketPairs);

  console.log(`[ScannerService: ${new Date().toISOString()}] Raw opportunities: ${rawOpportunities.length}`);

  // Analyze liquidity for top opportunities only (by spread %)
  // Analyzing all would take too long (3 API calls per opportunity)
  const MAX_LIQUIDITY_ANALYSIS = 70;
  const opportunitiesToAnalyze = rawOpportunities.slice(0, MAX_LIQUIDITY_ANALYSIS);
  const opportunitiesWithoutAnalysis = rawOpportunities.slice(MAX_LIQUIDITY_ANALYSIS);

  console.log(`[ScannerService: ${new Date().toISOString()}] Analyzing liquidity for top ${opportunitiesToAnalyze.length} opportunities...`);

  // OPTIMIZED: Batch liquidity analysis (parallel Polymarket, sequential Kalshi)
  const liquidityResults = await analyzeAllOpportunitiesLiquidity(opportunitiesToAnalyze);

  const opportunities: OpportunityWithLiquidity[] = [];

  // Add analyzed opportunities
  for (const opp of opportunitiesToAnalyze) {
    const liquidity = liquidityResults.get(opp) ?? null;
    opportunities.push({ opportunity: opp, liquidity });
  }

  // Add remaining opportunities without liquidity analysis
  for (const opp of opportunitiesWithoutAnalysis) {
    opportunities.push({ opportunity: opp, liquidity: null });
  }

  const result: ScanResult = {
    events: allEvents,
    opportunities,
    scannedAt: new Date(),
  };

  // Update cache
  cachedResult = result;
  cacheTimestamp = now;

  console.log(`[ScannerService: ${new Date().toISOString()}] Scan complete: ${allEvents.length} events, ${opportunities.length} opportunities`);

  return result;
}

export function getCachedResult(): ScanResult | null {
  const now = Date.now();
  if (cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult;
  }
  return null;
}
