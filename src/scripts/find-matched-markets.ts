/**
 * Find Matched Markets
 *
 * Main arbitrage scanner that:
 * 1. Loads market mappings from config
 * 2. Fetches data from both Polymarket and Kalshi
 * 3. Matches markets within events
 * 4. Identifies arbitrage opportunities
 * 5. Analyzes liquidity for top opportunities
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
} from '../matching/catalog-matcher.js';
import {
  matchMarketsWithinEvent,
  type MarketPair,
  type MarketData,
} from '../matching/market-matcher.js';
import {
  findArbitrageOpportunities,
  summarizeOpportunities,
  type ArbitrageOpportunity,
} from '../arbitrage/calculator.js';
import {
  fetchPolymarketOrderBook,
  fetchKalshiOrderBook,
} from '../orderbook/fetcher.js';
import {
  analyzeLiquidity,
  formatLiquidityAnalysis,
  summarizeLiquidity,
  type LiquidityAnalysis,
} from '../arbitrage/liquidity-analyzer.js';
import { POLYMARKET, KALSHI, SCANNER, DISPLAY } from '../config/api.js';

// ============ Configuration ============

const kalshiConfig = new Configuration({ basePath: KALSHI.API_URL });
const kalshiEventsApi = new EventsApi(kalshiConfig);

/** Current year for yearly events */
const CURRENT_YEAR = 2026;

// ============ Types ============

/** Result of fetching an event from either platform */
interface EventFetchResult {
  title: string;
  markets: MarketData[];
}

/** Combined result of matching an event across platforms */
interface MatchedPair {
  match: MatchResult;
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

// ============ Formatting Helpers ============

function formatPrice(price: number): string {
  return `${(price * 100).toFixed(1)}¢`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function printSeparator(char: '═' | '─' = '─'): void {
  console.log(char.repeat(DISPLAY.SEPARATOR_WIDTH));
}

function printHeader(title: string): void {
  printSeparator('═');
  console.log(title);
  printSeparator('═');
  console.log('');
}

function printSubheader(title: string): void {
  printSeparator('─');
  console.log(title);
  printSeparator('─');
  console.log('');
}

// ============ Platform Fetchers ============

/**
 * Fetch event data from Polymarket by slug.
 */
async function fetchPolymarketEvent(slug: string): Promise<EventFetchResult | null> {
  try {
    const response = await fetch(`${POLYMARKET.GAMMA_API_URL}/events?slug=${slug}`);
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
      };
    });

    return { title: event.title, markets };
  } catch {
    return null;
  }
}

/**
 * Fetch event data from Kalshi by ticker.
 * Extracts series from ticker automatically.
 */
async function fetchKalshiEvent(ticker: string): Promise<EventFetchResult | null> {
  const series = ticker.replace(/-.*$/, '');
  return fetchKalshiEventBySeries(ticker, series);
}

/**
 * Fetch event data from Kalshi by ticker and explicit series.
 * Use this when the series cannot be derived from the ticker.
 */
async function fetchKalshiEventBySeries(
  ticker: string,
  series: string
): Promise<EventFetchResult | null> {
  try {
    const response = await kalshiEventsApi.getEvents(
      100,
      undefined,
      true, // withNestedMarkets
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
      }));

    return { title: event.title || ticker, markets };
  } catch {
    return null;
  }
}

// ============ Event Processing ============

/**
 * Process a single match: fetch from both platforms and match markets.
 */
async function processMatch(
  match: MatchResult,
  fetchKalshi: (ticker: string, series?: string) => Promise<EventFetchResult | null>
): Promise<MatchedPair> {
  const [polyData, kalshiData] = await Promise.all([
    fetchPolymarketEvent(match.polymarketSlug),
    fetchKalshi(match.kalshiTicker, match.kalshiSeries),
  ]);

  let marketPairs: MarketPair[] | undefined;
  if (polyData && kalshiData) {
    marketPairs = matchMarketsWithinEvent(
      polyData.markets,
      kalshiData.markets,
      match.category,
      match.name
    );
  }

  return {
    match,
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

/**
 * Get status string for a matched pair.
 */
function getMatchStatus(pair: MatchedPair): string {
  const pairCount = pair.marketPairs?.length || 0;
  if (pair.polymarket.found && pair.kalshi.found) {
    return `✓ Both (${pairCount} pairs)`;
  }
  if (pair.polymarket.found) return '○ Poly only';
  if (pair.kalshi.found) return '○ Kalshi only';
  return '✗ Neither';
}

// ============ Yearly Events ============

async function processYearlyEvents(): Promise<MatchedPair[]> {
  printSubheader(`Fetching Yearly Events (${CURRENT_YEAR})...`);

  const matches = generateYearlyMatches(CURRENT_YEAR);
  const results: MatchedPair[] = [];

  for (const match of matches) {
    process.stdout.write(`  ${match.name}... `);

    const result = await processMatch(match, (ticker, series) =>
      fetchKalshiEventBySeries(ticker, series || ticker.replace(/-.*$/, ''))
    );
    results.push(result);

    console.log(getMatchStatus(result));
    await delay(SCANNER.RATE_LIMIT_DELAY_MS);
  }

  return results;
}

// ============ Dynamic Events ============

async function processDynamicEvents(): Promise<MatchedPair[]> {
  console.log('');
  printSubheader(`Fetching Dynamic Mappings (next ${SCANNER.DYNAMIC_SCAN_DAYS} days)...`);

  const results: MatchedPair[] = [];

  for (let dayOffset = 0; dayOffset < SCANNER.DYNAMIC_SCAN_DAYS; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);

    console.log(`${formatDate(date)}:`);

    const matches = generateDynamicMatches(date);
    for (const match of matches) {
      process.stdout.write(`  ${match.name}... `);

      const result = await processMatch(match, fetchKalshiEvent);
      results.push(result);

      console.log(getMatchStatus(result));
      await delay(SCANNER.RATE_LIMIT_DELAY_MS / 2);
    }

    console.log('');
  }

  return results;
}

// ============ Results Display ============

function displayMatchedPairs(pairs: MatchedPair[]): void {
  printHeader('Results: Markets Found on BOTH Platforms');

  const bothPlatforms = pairs.filter((p) => p.polymarket.found && p.kalshi.found);

  if (bothPlatforms.length === 0) {
    console.log('No markets found on both platforms.');
    return;
  }

  for (const pair of bothPlatforms) {
    displaySinglePair(pair);
  }
}

function displaySinglePair(pair: MatchedPair): void {
  const dateStr = pair.match.date ? ` - ${formatDate(pair.match.date)}` : '';
  console.log(`${pair.match.name}${dateStr}`);
  console.log(`  Type: ${pair.match.type} | Category: ${pair.match.category}`);
  console.log('');

  // Polymarket markets
  console.log(`  Polymarket: ${pair.match.polymarketSlug}`);
  if (pair.polymarket.markets) {
    displayMarketPreview(pair.polymarket.markets);
  }
  console.log('');

  // Kalshi markets
  console.log(`  Kalshi: ${pair.match.kalshiTicker}`);
  if (pair.kalshi.markets) {
    displayMarketPreview(pair.kalshi.markets);
  }

  console.log('');
  printSeparator('─');
  console.log('');
}

function displayMarketPreview(markets: MarketData[]): void {
  const preview = markets.slice(0, DISPLAY.PREVIEW_LIMIT);
  for (const m of preview) {
    const question = m.question.slice(0, 50);
    console.log(`    • ${question}: ${formatPrice(m.yesPrice)}`);
  }
  if (markets.length > DISPLAY.PREVIEW_LIMIT) {
    console.log(`    ... and ${markets.length - DISPLAY.PREVIEW_LIMIT} more`);
  }
}

// ============ Arbitrage Analysis ============

async function analyzeArbitrageOpportunities(
  marketPairs: MarketPair[],
  opportunities: ArbitrageOpportunity[]
): Promise<LiquidityAnalysis[]> {
  printHeader('Arbitrage Opportunities (with Liquidity Analysis)');

  if (opportunities.length === 0) {
    console.log('No significant arbitrage opportunities found (>2% spread).');
    return [];
  }

  const topOpps = opportunities.slice(0, SCANNER.MAX_LIQUIDITY_ANALYSIS);
  const analyses: LiquidityAnalysis[] = [];

  console.log(`Analyzing liquidity for top ${topOpps.length} opportunities...`);
  console.log('');

  for (const opp of topOpps) {
    const analysis = await analyzeOpportunity(opp);
    if (analysis) {
      analyses.push(analysis);
    }
    await delay(SCANNER.RATE_LIMIT_DELAY_MS);
  }

  // Show remaining opportunities
  if (opportunities.length > topOpps.length) {
    const remaining = opportunities.length - topOpps.length;
    console.log(`... and ${remaining} more opportunities (not analyzed for liquidity)`);
    console.log('');
  }

  // Display liquidity summary
  if (analyses.length > 0) {
    displayLiquiditySummary(analyses);
  }

  return analyses;
}

async function analyzeOpportunity(opp: ArbitrageOpportunity): Promise<LiquidityAnalysis | null> {
  const polyTokenIds = opp.pair.polymarket.tokenIds;
  const kalshiTicker = opp.pair.kalshi.ticker;
  const eventInfo = opp.pair.eventName ? ` [${opp.pair.eventName}]` : '';
  const marketName = `${opp.pair.matchedEntity}${eventInfo}`;

  if (!polyTokenIds || polyTokenIds.length < 2 || !kalshiTicker) {
    console.log(`⚠️  MISSING DATA - ${marketName}`);
    console.log(`  Spread: ${opp.profitPct.toFixed(1)}%`);
    console.log('  Cannot analyze: Missing market identifiers');
    if (!polyTokenIds) console.log('    - No Polymarket token IDs');
    if (!kalshiTicker) console.log('    - No Kalshi ticker');
    console.log('');
    return null;
  }

  try {
    const [polyBook, kalshiBook] = await Promise.all([
      fetchPolymarketOrderBook(polyTokenIds[0], polyTokenIds[1]),
      fetchKalshiOrderBook(kalshiTicker),
    ]);

    const analysis = analyzeLiquidity(opp, polyBook, kalshiBook);
    const label = getOpportunityLabel(analysis);

    console.log(`${label} - ${marketName}`);
    console.log(`  Spread: ${opp.profitPct.toFixed(1)}%`);
    console.log(formatLiquidityAnalysis(analysis));
    console.log('');
    return analysis;
  } catch {
    console.log(`⚠️  FETCH ERROR - ${marketName}`);
    console.log(`  Spread: ${opp.profitPct.toFixed(1)}%`);
    console.log('  Unable to fetch order books');
    console.log('');
    return null;
  }
}

function getOpportunityLabel(analysis: LiquidityAnalysis): string {
  const { limitedBy, maxProfit } = analysis;

  // No executable arbitrage
  if (limitedBy === 'no_liquidity') {
    return '❌ NO LIQUIDITY';
  }
  if (limitedBy === 'spread_closed') {
    return '📉 SPREAD CLOSED';
  }

  // Has executable arbitrage - show profit tier
  if (maxProfit >= 100) {
    return '🔥 GUARANTEED ($100+)';
  }
  if (maxProfit >= 10) {
    return '✅ GUARANTEED ($10+)';
  }
  return '✓  Guaranteed';
}

function displayLiquiditySummary(analyses: LiquidityAnalysis[]): void {
  const summary = summarizeLiquidity(analyses);

  printSeparator('─');
  console.log(`Liquidity Summary (Top ${SCANNER.MAX_LIQUIDITY_ANALYSIS})`);
  printSeparator('─');
  console.log(`  Opportunities with liquidity: ${summary.withLiquidity}/${summary.totalOpportunities}`);
  console.log(`  Total deployable capital: $${summary.totalDeployableCapital.toFixed(2)}`);
  console.log(`  Total potential profit: $${summary.totalPotentialProfit.toFixed(2)}`);
  if (summary.totalDeployableCapital > 0) {
    console.log(`  Average profit: ${summary.avgProfitPct.toFixed(2)}%`);
  }
  console.log(`  Opportunities >$100: ${summary.over100}`);
  console.log(`  Opportunities >$1000: ${summary.over1000}`);
  console.log('');
}

// ============ Final Summary ============

function displayFinalSummary(
  matchedPairs: MatchedPair[],
  marketPairs: MarketPair[],
  opportunities: ArbitrageOpportunity[]
): void {
  const arbSummary = summarizeOpportunities(opportunities);
  const bothPlatforms = matchedPairs.filter((p) => p.polymarket.found && p.kalshi.found);

  printHeader('Summary');
  console.log(`Total mappings checked: ${matchedPairs.length}`);
  console.log(`Found on both platforms: ${bothPlatforms.length}`);
  console.log(`Polymarket only: ${matchedPairs.filter((p) => p.polymarket.found && !p.kalshi.found).length}`);
  console.log(`Kalshi only: ${matchedPairs.filter((p) => !p.polymarket.found && p.kalshi.found).length}`);
  console.log(`Not found: ${matchedPairs.filter((p) => !p.polymarket.found && !p.kalshi.found).length}`);
  console.log('');
  console.log('Market-Level Matching:');
  console.log(`  Total market pairs matched: ${marketPairs.length}`);
  console.log(`  Arbitrage opportunities: ${arbSummary.total}`);
  console.log(`    - Guaranteed profit: ${arbSummary.guaranteed}`);
  console.log(`    - Simple (>2% spread): ${arbSummary.simple}`);
  if (arbSummary.total > 0) {
    console.log(`    - Max spread: ${arbSummary.maxSpreadPct.toFixed(1)}%`);
    console.log(`    - Avg spread: ${arbSummary.avgSpreadPct.toFixed(1)}%`);
  }
}

// ============ Utilities ============

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============ Main ============

async function main(): Promise<void> {
  printHeader('Matched Markets');

  // Load mappings
  const mappings = loadMappings();
  console.log(`Loaded ${mappings.static.length} static mappings`);
  console.log(`Loaded ${mappings.dynamic.length} dynamic patterns`);
  console.log('');

  // Process all events
  const yearlyPairs = await processYearlyEvents();
  const dynamicPairs = await processDynamicEvents();
  const allMatchedPairs = [...yearlyPairs, ...dynamicPairs];

  // Display matched pairs
  displayMatchedPairs(allMatchedPairs);

  // Collect all market pairs for arbitrage analysis
  const bothPlatforms = allMatchedPairs.filter((p) => p.polymarket.found && p.kalshi.found);
  const allMarketPairs = bothPlatforms.flatMap((p) => p.marketPairs || []);

  // Find and analyze arbitrage opportunities
  const opportunities = findArbitrageOpportunities(allMarketPairs);
  await analyzeArbitrageOpportunities(allMarketPairs, opportunities);

  // Display final summary
  displayFinalSummary(allMatchedPairs, allMarketPairs, opportunities);
}

main().catch(console.error);
