/**
 * Scanner Service
 *
 * Orchestrates the full arbitrage scanning pipeline.
 * Wraps the existing scanner logic for use by the API.
 */

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
import { SCANNER } from '../../config/api.js';
import {
  fetchNbaGameMatches,
  type NbaGameMatch,
} from '../../matching/nba-game-matcher.js';
import { matchNbaGameMarkets } from '../../matching/nba-market-matcher.js';
import {
  fetchPolymarketEvent,
  type EventFetchResult,
} from '../../connectors/polymarket-connector.js';
import {
  fetchKalshiEvent,
  fetchKalshiEventBySeries,
  getKalshiImageUrl,
  fetchKalshiNbaMarkets,
  filterKalshiNbaGame,
} from '../../connectors/kalshi-connector.js';
import { withRetry } from '../../helpers/helpers.js';

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

const CURRENT_YEAR = new Date().getFullYear();

// ============ Cache ============

let cachedResult: ScanResult | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

// ============ Scan Lock ============
// Prevents multiple concurrent scans - subsequent requests wait for the ongoing scan

let scanInProgress: Promise<ScanResult> | null = null;


// ============ NBA Markets Cache ============
// Cache for Kalshi NBA markets (fetched once per scan)
let kalshiNbaMarketsCache: any[] | null = null;

async function fetchAllKalshiNbaMarkets(): Promise<any[]> {
  if (kalshiNbaMarketsCache !== null) {
    return kalshiNbaMarketsCache;
  }
  const markets = await fetchKalshiNbaMarkets();
  kalshiNbaMarketsCache = markets;
  return markets;
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

// async function processDynamicEvents(): Promise<MatchedEvent[]> {
//   // Collect all matches first
//   const allMatches: MatchResult[] = [];
//   for (let dayOffset = 0; dayOffset < SCANNER.DYNAMIC_SCAN_DAYS; dayOffset++) {
//     const date = new Date();
//     date.setDate(date.getDate() + dayOffset);
//     allMatches.push(...generateDynamicMatches(date));
//   }

//   if (allMatches.length === 0) return [];

//   // OPTIMIZED: Fetch all Polymarket events in parallel
//   const polyPromises = allMatches.map((m) => fetchPolymarketEvent(m.polymarketSlug));
//   const polyResults = await Promise.all(polyPromises);

//   // Fetch Kalshi events sequentially (no delay needed)
//   const kalshiResults: (EventFetchResult | null)[] = [];
//   for (const match of allMatches) {
//     const result = await fetchKalshiEvent(match.kalshiTicker);
//     kalshiResults.push(result);
//   }

//   // Combine results
//   return allMatches.map((match, i) =>
//     buildMatchedEvent(match, polyResults[i], kalshiResults[i])
//   );
// }

// async function processNbaGames(): Promise<MatchedEvent[]> {
//   const today = new Date();
//   const endDate = new Date();
//   endDate.setDate(today.getDate() + SCANNER.DYNAMIC_SCAN_DAYS);

//   const games = await fetchNbaGameMatches(today, endDate);
//   if (games.length === 0) return [];

//   // OPTIMIZED: Fetch Polymarket events in parallel + Kalshi NBA markets once
//   const [polyResults, allKalshiNbaMarkets] = await Promise.all([
//     Promise.all(games.map((g) => fetchPolymarketEvent(g.polymarketSlug))),
//     fetchAllKalshiNbaMarkets(),
//   ]);

//   // Filter Kalshi markets for each game (no API calls, just filtering)
//   const kalshiResults = games.map((game) =>
//     filterKalshiNbaGame(allKalshiNbaMarkets, game.kalshiTicker)
//   );

//   // Process and combine results
//   const results: MatchedEvent[] = [];
//   for (let i = 0; i < games.length; i++) {
//     const game = games[i];
//     const polyData = polyResults[i];
//     const kalshiData = kalshiResults[i];

//     let marketPairs: MarketPair[] | undefined;
//     if (polyData && kalshiData) {
//       marketPairs = matchNbaGameMarkets(
//         polyData.markets,
//         kalshiData.markets,
//         game,
//         kalshiData.imageUrl,
//         game.polymarketSlug
//       );
//     }

//     results.push({
//       name: `${game.awayTeam} @ ${game.homeTeam}`,
//       category: 'nba_game',
//       type: 'dynamic',
//       polymarketSlug: game.polymarketSlug,
//       kalshiTicker: game.kalshiTicker,
//       kalshiSeries: game.kalshiSeries,
//       kalshiImageUrl: kalshiData?.imageUrl,
//       date: game.date,
//       polymarket: {
//         found: !!polyData,
//         title: polyData?.title,
//         markets: polyData?.markets,
//       },
//       kalshi: {
//         found: !!kalshiData,
//         title: kalshiData?.title,
//         markets: kalshiData?.markets,
//       },
//       marketPairs,
//     });
//   }

//   return results;
// }

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

  const yearlyEvents = await processYearlyEvents();

  const allEvents = [...yearlyEvents];

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
