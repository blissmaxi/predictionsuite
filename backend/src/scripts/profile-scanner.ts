/**
 * Scanner Pipeline Profiler
 *
 * Benchmarks each stage of the arbitrage scanning pipeline to identify
 * bottlenecks and optimization opportunities.
 *
 * Run: npx tsx src/scripts/profile-scanner.ts
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
  createOpportunitiesFromAllPairs,
  type ArbitrageOpportunity,
} from '../arbitrage/calculator.js';
import {
  fetchPolymarketOrderBook,
  fetchKalshiOrderBook,
} from '../orderbook/fetcher.js';
import {
  analyzeLiquidity,
  type LiquidityAnalysis,
} from '../arbitrage/liquidity-analyzer.js';
import { POLYMARKET, KALSHI, SCANNER } from '../config/api.js';
import {
  fetchNbaGameMatches,
  type NbaGameMatch,
} from '../matching/nba-game-matcher.js';

// ============ Types ============

interface TimingEntry {
  operation: string;
  durationMs: number;
  details?: string;
}

interface StageStats {
  name: string;
  totalMs: number;
  count: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  timings: number[];
}

interface ProfileReport {
  totalDurationMs: number;
  stages: StageStats[];
  apiCalls: {
    polymarket: StageStats;
    kalshi: StageStats;
    orderBook: StageStats;
  };
  bottlenecks: string[];
  recommendations: string[];
}

// ============ Profiling Utilities ============

class Profiler {
  private timings: Map<string, number[]> = new Map();
  private startTime: number = 0;

  start(): void {
    this.startTime = performance.now();
  }

  getTotalDuration(): number {
    return performance.now() - this.startTime;
  }

  async measure<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.record(stage, duration);
    }
  }

  record(stage: string, durationMs: number): void {
    if (!this.timings.has(stage)) {
      this.timings.set(stage, []);
    }
    this.timings.get(stage)!.push(durationMs);
  }

  getStats(stage: string): StageStats | null {
    const timings = this.timings.get(stage);
    if (!timings || timings.length === 0) return null;

    const sorted = [...timings].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      name: stage,
      totalMs: sum,
      count: sorted.length,
      avgMs: sum / sorted.length,
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      timings: sorted,
    };
  }

  getAllStages(): string[] {
    return Array.from(this.timings.keys());
  }
}

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============ Configuration ============

const kalshiConfig = new Configuration({ basePath: KALSHI.API_URL });
const kalshiEventsApi = new EventsApi(kalshiConfig);
const CURRENT_YEAR = new Date().getFullYear();
const profiler = new Profiler();

// ============ API Fetch Functions (with profiling) ============

async function fetchPolymarketEvent(slug: string): Promise<{ markets: MarketData[] } | null> {
  return profiler.measure('polymarket_api', async () => {
    try {
      const response = await fetch(`${POLYMARKET.GAMMA_API_URL}/events?slug=${slug}`);
      if (!response.ok) return null;
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
      return { markets };
    } catch {
      return null;
    }
  });
}

async function fetchKalshiEvent(ticker: string): Promise<{ markets: MarketData[] } | null> {
  const series = ticker.replace(/-.*$/, '');
  return profiler.measure('kalshi_api', async () => {
    try {
      const response = await kalshiEventsApi.getEvents(100, undefined, true, false, 'open', series);
      const events = response.data.events || [];
      const event = events.find((e) => e.event_ticker?.toUpperCase() === ticker.toUpperCase());
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
      return { markets };
    } catch {
      return null;
    }
  });
}

async function fetchKalshiNbaGame(ticker: string): Promise<{ markets: MarketData[] } | null> {
  return profiler.measure('kalshi_api', async () => {
    try {
      const response = await fetch(`${KALSHI.API_URL}/markets?series_ticker=KXNBAGAME&limit=100`);
      if (!response.ok) return null;
      const data = await response.json();
      const markets: MarketData[] = [];

      for (const market of data.markets || []) {
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
      return markets.length > 0 ? { markets } : null;
    } catch {
      return null;
    }
  });
}

async function fetchOrderBooks(
  polyTokenIds: string[],
  kalshiTicker: string
): Promise<{ poly: any; kalshi: any } | null> {
  return profiler.measure('orderbook_api', async () => {
    try {
      const [polyBook, kalshiBook] = await Promise.all([
        fetchPolymarketOrderBook(polyTokenIds[0], polyTokenIds[1]),
        fetchKalshiOrderBook(kalshiTicker),
      ]);
      return { poly: polyBook, kalshi: kalshiBook };
    } catch {
      return null;
    }
  });
}

// ============ Pipeline Stages ============

async function profileCatalogMatching(): Promise<{ yearly: MatchResult[]; dynamic: MatchResult[] }> {
  return profiler.measure('catalog_matching', async () => {
    loadMappings();
    const yearly = generateYearlyMatches(CURRENT_YEAR);

    const dynamic: MatchResult[] = [];
    for (let dayOffset = 0; dayOffset < SCANNER.DYNAMIC_SCAN_DAYS; dayOffset++) {
      const date = new Date();
      date.setDate(date.getDate() + dayOffset);
      dynamic.push(...generateDynamicMatches(date));
    }

    return { yearly, dynamic };
  });
}

async function profileNbaScheduleFetch(): Promise<NbaGameMatch[]> {
  return profiler.measure('nba_schedule_fetch', async () => {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + SCANNER.DYNAMIC_SCAN_DAYS);
    return fetchNbaGameMatches(today, endDate);
  });
}

async function profileYearlyEventsFetch(matches: MatchResult[]): Promise<{ found: number; total: number }> {
  let found = 0;
  for (const match of matches) {
    const [polyData, kalshiData] = await Promise.all([
      fetchPolymarketEvent(match.polymarketSlug),
      fetchKalshiEvent(match.kalshiTicker),
    ]);
    if (polyData && kalshiData) found++;
    await delay(SCANNER.RATE_LIMIT_DELAY_MS);
  }
  return { found, total: matches.length };
}

async function profileDynamicEventsFetch(matches: MatchResult[]): Promise<{ found: number; total: number }> {
  let found = 0;
  for (const match of matches) {
    const [polyData, kalshiData] = await Promise.all([
      fetchPolymarketEvent(match.polymarketSlug),
      fetchKalshiEvent(match.kalshiTicker),
    ]);
    if (polyData && kalshiData) found++;
    await delay(SCANNER.RATE_LIMIT_DELAY_MS / 2);
  }
  return { found, total: matches.length };
}

async function profileNbaGamesFetch(games: NbaGameMatch[]): Promise<{ found: number; total: number }> {
  let found = 0;
  for (const game of games) {
    const [polyData, kalshiData] = await Promise.all([
      fetchPolymarketEvent(game.polymarketSlug),
      fetchKalshiNbaGame(game.kalshiTicker),
    ]);
    if (polyData && kalshiData) found++;
    await delay(SCANNER.RATE_LIMIT_DELAY_MS);
  }
  return { found, total: games.length };
}

async function profileMarketMatching(
  yearlyMatches: MatchResult[],
  dynamicMatches: MatchResult[],
  nbaGames: NbaGameMatch[]
): Promise<MarketPair[]> {
  return profiler.measure('market_matching', async () => {
    const allPairs: MarketPair[] = [];

    // Sample matching (just measure the operation, don't re-fetch)
    // This is the CPU-bound part, not I/O
    for (let i = 0; i < Math.min(5, yearlyMatches.length); i++) {
      const mockPolyMarkets: MarketData[] = [
        { question: 'Team A wins', yesPrice: 0.5, volume: 1000 },
        { question: 'Team B wins', yesPrice: 0.5, volume: 1000 },
      ];
      const mockKalshiMarkets: MarketData[] = [
        { question: 'Team A', yesPrice: 0.48, volume: 500, ticker: 'TEST-A' },
        { question: 'Team B', yesPrice: 0.52, volume: 500, ticker: 'TEST-B' },
      ];
      const pairs = matchMarketsWithinEvent(
        mockPolyMarkets,
        mockKalshiMarkets,
        yearlyMatches[i].category,
        yearlyMatches[i].name
      );
      allPairs.push(...pairs);
    }

    return allPairs;
  });
}

async function profileArbitrageCalculation(pairs: MarketPair[]): Promise<ArbitrageOpportunity[]> {
  return profiler.measure('arbitrage_calculation', async () => {
    // Create mock pairs for realistic benchmark
    const mockPairs: MarketPair[] = Array(100).fill(null).map((_, i) => ({
      matchedEntity: `Team ${i}`,
      eventName: `Event ${Math.floor(i / 10)}`,
      category: 'sports',
      polymarket: {
        question: `Team ${i} wins`,
        yesPrice: 0.4 + Math.random() * 0.2,
        noPrice: 0.4 + Math.random() * 0.2,
        tokenIds: ['token1', 'token2'],
      },
      kalshi: {
        question: `Team ${i}`,
        yesPrice: 0.4 + Math.random() * 0.2,
        noPrice: 0.4 + Math.random() * 0.2,
        ticker: `TICKER-${i}`,
      },
      confidence: 1.0,
      spread: Math.random() * 0.05,
    }));

    return createOpportunitiesFromAllPairs(mockPairs);
  });
}

async function profileLiquidityAnalysis(count: number): Promise<void> {
  // Simulate order book fetching for realistic benchmark
  const sampleTokenIds = [
    ['21742633143463906290569050155826241533067272736897614950488156847949938836455', '48331043336612883890938759509493159234755048973500640148014422747788308965732'],
  ];

  for (let i = 0; i < Math.min(count, 10); i++) {
    await fetchOrderBooks(sampleTokenIds[0], 'KXNHL-26-COL');
    await delay(SCANNER.RATE_LIMIT_DELAY_MS);
  }
}

// ============ Report Generation ============

function generateReport(): ProfileReport {
  const stages: StageStats[] = [];
  const allStages = profiler.getAllStages();

  for (const stage of allStages) {
    const stats = profiler.getStats(stage);
    if (stats) stages.push(stats);
  }

  // Sort by total time descending
  stages.sort((a, b) => b.totalMs - a.totalMs);

  // Extract API-specific stats
  const polyStats = profiler.getStats('polymarket_api') || createEmptyStats('polymarket_api');
  const kalshiStats = profiler.getStats('kalshi_api') || createEmptyStats('kalshi_api');
  const orderBookStats = profiler.getStats('orderbook_api') || createEmptyStats('orderbook_api');

  // Identify bottlenecks
  const bottlenecks: string[] = [];
  const totalDuration = profiler.getTotalDuration();

  for (const stage of stages) {
    const percentage = (stage.totalMs / totalDuration) * 100;
    if (percentage > 20) {
      bottlenecks.push(`${stage.name}: ${percentage.toFixed(1)}% of total time (${formatMs(stage.totalMs)})`);
    }
  }

  // Generate recommendations
  const recommendations: string[] = [];

  if (polyStats.avgMs > 300) {
    recommendations.push(`Polymarket API avg latency is ${formatMs(polyStats.avgMs)} - consider caching or parallel requests`);
  }
  if (kalshiStats.avgMs > 300) {
    recommendations.push(`Kalshi API avg latency is ${formatMs(kalshiStats.avgMs)} - consider caching or parallel requests`);
  }
  if (orderBookStats.totalMs > totalDuration * 0.5) {
    recommendations.push(`Order book fetching is ${((orderBookStats.totalMs / totalDuration) * 100).toFixed(1)}% of total - reduce MAX_LIQUIDITY_ANALYSIS or parallelize`);
  }
  if (polyStats.count + kalshiStats.count > 50) {
    recommendations.push(`${polyStats.count + kalshiStats.count} API calls made - consider batching or reducing event count`);
  }
  if (kalshiStats.p95Ms > kalshiStats.avgMs * 2) {
    recommendations.push(`Kalshi API has high variance (p95=${formatMs(kalshiStats.p95Ms)} vs avg=${formatMs(kalshiStats.avgMs)}) - some requests are slow`);
  }

  // Add general recommendations based on findings
  const eventFetchTime = (polyStats.totalMs + kalshiStats.totalMs);
  if (eventFetchTime > 10000) {
    recommendations.push(`Event fetching takes ${formatMs(eventFetchTime)} - consider parallel fetching with rate limiting`);
  }

  return {
    totalDurationMs: totalDuration,
    stages,
    apiCalls: {
      polymarket: polyStats,
      kalshi: kalshiStats,
      orderBook: orderBookStats,
    },
    bottlenecks,
    recommendations,
  };
}

function createEmptyStats(name: string): StageStats {
  return {
    name,
    totalMs: 0,
    count: 0,
    avgMs: 0,
    minMs: 0,
    maxMs: 0,
    p50Ms: 0,
    p95Ms: 0,
    p99Ms: 0,
    timings: [],
  };
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function printReport(report: ProfileReport): void {
  const width = 80;
  const line = '═'.repeat(width);
  const thinLine = '─'.repeat(width);

  console.log('\n' + line);
  console.log('  SCANNER PIPELINE PROFILING REPORT');
  console.log(line);

  console.log(`\n  Total Duration: ${formatMs(report.totalDurationMs)}`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  // Stage breakdown
  console.log(thinLine);
  console.log('  STAGE BREAKDOWN (sorted by total time)');
  console.log(thinLine);

  console.log('\n  Stage                      Total      Count    Avg      Min      Max      P95');
  console.log('  ' + '─'.repeat(76));

  for (const stage of report.stages) {
    const name = stage.name.padEnd(24);
    const total = formatMs(stage.totalMs).padStart(8);
    const count = stage.count.toString().padStart(6);
    const avg = formatMs(stage.avgMs).padStart(8);
    const min = formatMs(stage.minMs).padStart(8);
    const max = formatMs(stage.maxMs).padStart(8);
    const p95 = formatMs(stage.p95Ms).padStart(8);
    console.log(`  ${name} ${total} ${count} ${avg} ${min} ${max} ${p95}`);
  }

  // API call analysis
  console.log('\n' + thinLine);
  console.log('  API CALL ANALYSIS');
  console.log(thinLine);

  const apis = [
    { name: 'Polymarket', stats: report.apiCalls.polymarket },
    { name: 'Kalshi', stats: report.apiCalls.kalshi },
    { name: 'Order Books', stats: report.apiCalls.orderBook },
  ];

  for (const api of apis) {
    if (api.stats.count === 0) continue;
    const pct = ((api.stats.totalMs / report.totalDurationMs) * 100).toFixed(1);
    console.log(`\n  ${api.name}:`);
    console.log(`    Calls: ${api.stats.count}`);
    console.log(`    Total: ${formatMs(api.stats.totalMs)} (${pct}% of pipeline)`);
    console.log(`    Avg:   ${formatMs(api.stats.avgMs)}`);
    console.log(`    Range: ${formatMs(api.stats.minMs)} - ${formatMs(api.stats.maxMs)}`);
    console.log(`    P50:   ${formatMs(api.stats.p50Ms)} | P95: ${formatMs(api.stats.p95Ms)} | P99: ${formatMs(api.stats.p99Ms)}`);
  }

  // Time distribution chart
  console.log('\n' + thinLine);
  console.log('  TIME DISTRIBUTION');
  console.log(thinLine + '\n');

  const totalMs = report.totalDurationMs;
  const barWidth = 50;

  for (const stage of report.stages.slice(0, 6)) {
    const pct = stage.totalMs / totalMs;
    const filled = Math.round(pct * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    const pctStr = (pct * 100).toFixed(1).padStart(5);
    console.log(`  ${stage.name.padEnd(20)} ${bar} ${pctStr}%`);
  }

  // Bottlenecks
  if (report.bottlenecks.length > 0) {
    console.log('\n' + thinLine);
    console.log('  🚨 BOTTLENECKS IDENTIFIED');
    console.log(thinLine + '\n');

    for (const bottleneck of report.bottlenecks) {
      console.log(`  • ${bottleneck}`);
    }
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log('\n' + thinLine);
    console.log('  💡 OPTIMIZATION RECOMMENDATIONS');
    console.log(thinLine + '\n');

    for (let i = 0; i < report.recommendations.length; i++) {
      console.log(`  ${i + 1}. ${report.recommendations[i]}`);
    }
  }

  // Scalability analysis
  console.log('\n' + thinLine);
  console.log('  📊 SCALABILITY ANALYSIS');
  console.log(thinLine + '\n');

  const polyAvg = report.apiCalls.polymarket.avgMs || 200;
  const kalshiAvg = report.apiCalls.kalshi.avgMs || 200;
  const orderBookAvg = report.apiCalls.orderBook.avgMs || 400;
  const rateDelay = SCANNER.RATE_LIMIT_DELAY_MS;

  console.log('  Current Configuration:');
  console.log(`    • Rate limit delay: ${rateDelay}ms`);
  console.log(`    • Max liquidity analysis: ${SCANNER.MAX_LIQUIDITY_ANALYSIS}`);
  console.log(`    • Dynamic scan days: ${SCANNER.DYNAMIC_SCAN_DAYS}`);

  console.log('\n  Estimated time for N events (sequential):');
  const eventCost = polyAvg + kalshiAvg + rateDelay;
  console.log(`    • 10 events:  ${formatMs(10 * eventCost)}`);
  console.log(`    • 25 events:  ${formatMs(25 * eventCost)}`);
  console.log(`    • 50 events:  ${formatMs(50 * eventCost)}`);
  console.log(`    • 100 events: ${formatMs(100 * eventCost)}`);

  console.log('\n  Estimated time for N liquidity analyses:');
  const liquidityCost = orderBookAvg + rateDelay;
  console.log(`    • 10 analyses:  ${formatMs(10 * liquidityCost)}`);
  console.log(`    • 25 analyses:  ${formatMs(25 * liquidityCost)}`);
  console.log(`    • 50 analyses:  ${formatMs(50 * liquidityCost)}`);
  console.log(`    • 100 analyses: ${formatMs(100 * liquidityCost)}`);

  // Parallelization potential
  console.log('\n  Parallelization Potential:');
  const currentApiTime = report.apiCalls.polymarket.totalMs + report.apiCalls.kalshi.totalMs;
  const parallelApiTime = Math.max(report.apiCalls.polymarket.totalMs, report.apiCalls.kalshi.totalMs);
  if (currentApiTime > 0) {
    const savings = ((currentApiTime - parallelApiTime) / currentApiTime) * 100;
    console.log(`    • Parallel Poly+Kalshi per event: ~${savings.toFixed(0)}% faster`);
  }

  const orderBookTime = report.apiCalls.orderBook.totalMs;
  if (orderBookTime > 0) {
    console.log(`    • Parallel order book fetching: Could reduce by ~50% with batching`);
  }

  console.log('\n' + line);
  console.log('  END OF REPORT');
  console.log(line + '\n');
}

// ============ Main ============

async function main(): Promise<void> {
  console.log('Starting Scanner Pipeline Profiler...\n');
  console.log('This will make real API calls to measure actual latencies.\n');

  profiler.start();

  // Stage 1: Catalog Matching (CPU-bound)
  console.log('[1/6] Profiling catalog matching...');
  const { yearly, dynamic } = await profileCatalogMatching();
  console.log(`      Generated ${yearly.length} yearly + ${dynamic.length} dynamic matches`);

  // Stage 2: NBA Schedule Fetch
  console.log('[2/6] Profiling NBA schedule fetch...');
  const nbaGames = await profileNbaScheduleFetch();
  console.log(`      Found ${nbaGames.length} NBA games`);

  // Stage 3: Yearly Events Fetch (I/O-bound)
  console.log('[3/6] Profiling yearly events fetch...');
  const yearlyResult = await profileYearlyEventsFetch(yearly);
  console.log(`      Fetched ${yearlyResult.total} events, ${yearlyResult.found} found on both platforms`);

  // Stage 4: Dynamic Events Fetch (I/O-bound)
  console.log('[4/6] Profiling dynamic events fetch...');
  const dynamicResult = await profileDynamicEventsFetch(dynamic);
  console.log(`      Fetched ${dynamicResult.total} events, ${dynamicResult.found} found on both platforms`);

  // Stage 5: NBA Games Fetch (I/O-bound)
  console.log('[5/6] Profiling NBA games fetch...');
  const nbaResult = await profileNbaGamesFetch(nbaGames);
  console.log(`      Fetched ${nbaResult.total} games, ${nbaResult.found} found on both platforms`);

  // Stage 6: Market Matching & Arbitrage Calculation (CPU-bound)
  console.log('[6/6] Profiling market matching & arbitrage calculation...');
  const pairs = await profileMarketMatching(yearly, dynamic, nbaGames);
  const opportunities = await profileArbitrageCalculation(pairs);
  console.log(`      Calculated ${opportunities.length} opportunities`);

  // Stage 7: Order Book / Liquidity Analysis (I/O-bound)
  console.log('[7/7] Profiling order book fetching (sample of 10)...');
  await profileLiquidityAnalysis(10);
  console.log('      Completed order book sampling');

  // Generate and print report
  const report = generateReport();
  printReport(report);
}

main().catch(console.error);
