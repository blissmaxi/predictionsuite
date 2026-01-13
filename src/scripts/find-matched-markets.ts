/**
 * Find Matched Markets
 *
 * Loads market mappings from config, fetches data from both platforms,
 * and outputs matched market pairs with prices.
 */

import {
  EventsApi,
  Configuration,
  type Market as KalshiMarket,
} from 'kalshi-typescript';
import {
  loadMappings,
  getAllStaticMappings,
  generateDynamicMatches,
  generateYearlyMatches,
  type MatchResult,
} from '../matching/catalog-matcher.js';
import {
  matchMarketsWithinEvent,
  type MarketPair,
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

// ============ Config ============

const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';
const POLYMARKET_API_URL = 'https://gamma-api.polymarket.com';

const config = new Configuration({ basePath: KALSHI_API_URL });
const kalshiEventsApi = new EventsApi(config);

// ============ Types ============

interface MarketData {
  question: string;
  yesPrice: number;
  volume?: number;
}

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

// ============ Helpers ============

function formatPrice(price: number): string {
  return (price * 100).toFixed(1) + '¢';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ============ Fetchers ============

async function fetchPolymarketEvent(slug: string): Promise<{
  title: string;
  markets: MarketData[];
} | null> {
  try {
    const response = await fetch(`${POLYMARKET_API_URL}/events?slug=${slug}`);
    const data = await response.json();

    if (data.length > 0) {
      const event = data[0];
      const markets: MarketData[] = (event.markets || []).map((m: any) => {
        const prices = JSON.parse(m.outcomePrices || '["0","0"]');
        const tokenIds = m.clobTokenIds ? JSON.parse(m.clobTokenIds) : undefined;
        return {
          question: m.question || m.groupItemTitle || 'Unknown',
          yesPrice: parseFloat(prices[0]) || 0,
          volume: m.volumeNum || 0,
          tokenIds,  // [yesTokenId, noTokenId]
        };
      });

      return {
        title: event.title,
        markets,
      };
    }
  } catch (error) {
    // Event not found
  }

  return null;
}

async function fetchKalshiEvent(ticker: string): Promise<{
  title: string;
  markets: MarketData[];
} | null> {
  try {
    // Extract series from ticker (e.g., KXHIGHNY from KXHIGHNY-26JAN12)
    const series = ticker.replace(/-.*$/, '');

    const response = await kalshiEventsApi.getEvents(
      100,
      undefined,
      true,  // withNestedMarkets
      false,
      'open',
      series
    );

    // Find the specific event
    for (const event of response.data.events || []) {
      if (event.event_ticker?.toUpperCase() === ticker.toUpperCase()) {
        const markets: MarketData[] = (event.markets || [])
          .filter((m: KalshiMarket) => m.status === 'active')
          .map((m: KalshiMarket) => ({
            question: m.yes_sub_title || m.title || 'Unknown',
            yesPrice: parseFloat(m.last_price_dollars || '0') || 0,
            volume: m.volume || 0,
            ticker: m.ticker,  // Market ticker for order book fetching
          }));

        return {
          title: event.title || ticker,
          markets,
        };
      }
    }
  } catch (error) {
    // Event not found
  }

  return null;
}

async function fetchKalshiEventBySeries(
  ticker: string,
  series?: string
): Promise<{
  title: string;
  markets: MarketData[];
} | null> {
  try {
    // Use series ticker if provided, otherwise extract from event ticker
    const seriesTicker = series || ticker.replace(/-.*$/, '');

    const response = await kalshiEventsApi.getEvents(
      100,
      undefined,
      true,  // withNestedMarkets
      false,
      'open',
      seriesTicker
    );

    // Find the specific event by ticker
    for (const event of response.data.events || []) {
      if (event.event_ticker?.toUpperCase() === ticker.toUpperCase()) {
        const markets: MarketData[] = (event.markets || [])
          .filter((m: KalshiMarket) => m.status === 'active')
          .map((m: KalshiMarket) => ({
            question: m.yes_sub_title || m.title || 'Unknown',
            yesPrice: parseFloat(m.last_price_dollars || '0') || 0,
            volume: m.volume || 0,
            ticker: m.ticker,  // Market ticker for order book fetching
          }));

        return {
          title: event.title || ticker,
          markets,
        };
      }
    }
  } catch (error) {
    // Event not found
  }

  return null;
}

// ============ Main ============

async function main() {
  console.log('═'.repeat(70));
  console.log('Matched Markets');
  console.log('═'.repeat(70));
  console.log('');

  // Load mappings
  const mappings = loadMappings();
  console.log(`Loaded ${mappings.static.length} static mappings`);
  console.log(`Loaded ${mappings.dynamic.length} dynamic patterns`);
  console.log('');

  const matchedPairs: MatchedPair[] = [];

  // Process yearly mappings (sports championships)
  console.log('─'.repeat(70));
  console.log('Fetching Yearly Events (2026)...');
  console.log('─'.repeat(70));
  console.log('');

  const yearlyMatches = generateYearlyMatches(2026);

  for (const match of yearlyMatches) {
    process.stdout.write(`  ${match.name}... `);

    const [polyData, kalshiData] = await Promise.all([
      fetchPolymarketEvent(match.polymarketSlug),
      fetchKalshiEventBySeries(match.kalshiTicker, match.kalshiSeries),
    ]);

    // Match individual markets within the event
    let marketPairs: MarketPair[] | undefined;
    if (polyData && kalshiData) {
      marketPairs = matchMarketsWithinEvent(
        polyData.markets,
        kalshiData.markets,
        match.category,
        match.name
      );
    }

    matchedPairs.push({
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
    });

    const pairCount = marketPairs?.length || 0;
    const status = polyData && kalshiData ? `✓ Both (${pairCount} pairs)` :
                   polyData ? '○ Poly only' :
                   kalshiData ? '○ Kalshi only' : '✗ Neither';
    console.log(status);

    await new Promise(r => setTimeout(r, 100));
  }

  // Process dynamic mappings for next 3 days
  console.log('');
  console.log('─'.repeat(70));
  console.log('Fetching Dynamic Mappings (next 3 days)...');
  console.log('─'.repeat(70));
  console.log('');

  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);

    console.log(`${formatDate(date)}:`);

    const dynamicMatches = generateDynamicMatches(date);

    for (const match of dynamicMatches) {
      process.stdout.write(`  ${match.name}... `);

      const [polyData, kalshiData] = await Promise.all([
        fetchPolymarketEvent(match.polymarketSlug),
        fetchKalshiEvent(match.kalshiTicker),
      ]);

      // Match individual markets within the event
      let marketPairs: MarketPair[] | undefined;
      if (polyData && kalshiData) {
        marketPairs = matchMarketsWithinEvent(
          polyData.markets,
          kalshiData.markets,
          match.category,
          match.name
        );
      }

      matchedPairs.push({
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
      });

      const pairCount = marketPairs?.length || 0;
      const status = polyData && kalshiData ? `✓ Both (${pairCount} pairs)` :
                     polyData ? '○ Poly only' :
                     kalshiData ? '○ Kalshi only' : '✗ Neither';
      console.log(status);

      await new Promise(r => setTimeout(r, 50));
    }

    console.log('');
  }

  // Display matched pairs with prices
  console.log('═'.repeat(70));
  console.log('Results: Markets Found on BOTH Platforms');
  console.log('═'.repeat(70));
  console.log('');

  const bothPlatforms = matchedPairs.filter(p => p.polymarket.found && p.kalshi.found);

  if (bothPlatforms.length === 0) {
    console.log('No markets found on both platforms.');
  } else {
    for (const pair of bothPlatforms) {
      const dateStr = pair.match.date ? ` - ${formatDate(pair.match.date)}` : '';
      console.log(`${pair.match.name}${dateStr}`);
      console.log(`  Type: ${pair.match.type} | Category: ${pair.match.category}`);
      console.log('');

      console.log(`  Polymarket: ${pair.match.polymarketSlug}`);
      if (pair.polymarket.markets) {
        for (const m of pair.polymarket.markets.slice(0, 3)) {
          console.log(`    • ${m.question.slice(0, 50)}: ${formatPrice(m.yesPrice)}`);
        }
        if (pair.polymarket.markets.length > 3) {
          console.log(`    ... and ${pair.polymarket.markets.length - 3} more`);
        }
      }
      console.log('');

      console.log(`  Kalshi: ${pair.match.kalshiTicker}`);
      if (pair.kalshi.markets) {
        for (const m of pair.kalshi.markets.slice(0, 3)) {
          console.log(`    • ${m.question.slice(0, 50)}: ${formatPrice(m.yesPrice)}`);
        }
        if (pair.kalshi.markets.length > 3) {
          console.log(`    ... and ${pair.kalshi.markets.length - 3} more`);
        }
      }

      console.log('');
      console.log('─'.repeat(70));
      console.log('');
    }
  }

  // Collect all market pairs for arbitrage analysis
  const allMarketPairs: MarketPair[] = [];
  for (const pair of bothPlatforms) {
    if (pair.marketPairs) {
      allMarketPairs.push(...pair.marketPairs);
    }
  }

  // Find arbitrage opportunities
  const arbitrageOpps = findArbitrageOpportunities(allMarketPairs);

  // Display arbitrage opportunities with liquidity analysis
  console.log('═'.repeat(70));
  console.log('Arbitrage Opportunities (with Liquidity Analysis)');
  console.log('═'.repeat(70));
  console.log('');

  if (arbitrageOpps.length === 0) {
    console.log('No significant arbitrage opportunities found (>2% spread).');
  } else {
    // Analyze liquidity for top opportunities (limit to avoid too many API calls)
    const topOpps = arbitrageOpps.slice(0, 10);
    const liquidityAnalyses: LiquidityAnalysis[] = [];

    console.log(`Analyzing liquidity for top ${topOpps.length} opportunities...`);
    console.log('');

    for (const opp of topOpps) {
      const typeLabel = opp.type === 'guaranteed' ? '🔥 GUARANTEED' : '📊 Simple';
      const eventInfo = opp.pair.eventName ? ` [${opp.pair.eventName}]` : '';
      console.log(`${typeLabel} - ${opp.pair.matchedEntity}${eventInfo}`);
      console.log(`  Spread: ${opp.profitPct.toFixed(1)}%`);

      // Check if we have the required identifiers
      const polyTokenIds = opp.pair.polymarket.tokenIds;
      const kalshiTicker = opp.pair.kalshi.ticker;

      if (polyTokenIds && polyTokenIds.length >= 2 && kalshiTicker) {
        try {
          // Fetch order books
          const [polyBook, kalshiBook] = await Promise.all([
            fetchPolymarketOrderBook(polyTokenIds[0], polyTokenIds[1]),
            fetchKalshiOrderBook(kalshiTicker),
          ]);

          // Analyze liquidity
          const analysis = analyzeLiquidity(opp, polyBook, kalshiBook);
          liquidityAnalyses.push(analysis);

          console.log(formatLiquidityAnalysis(analysis));
        } catch (error) {
          console.log(`  Liquidity: Unable to fetch order books`);
        }
      } else {
        console.log(`  Liquidity: Missing market identifiers`);
        if (!polyTokenIds) console.log(`    - No Polymarket token IDs`);
        if (!kalshiTicker) console.log(`    - No Kalshi ticker`);
      }

      console.log('');

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }

    // Show remaining opportunities without liquidity analysis
    if (arbitrageOpps.length > topOpps.length) {
      console.log(`... and ${arbitrageOpps.length - topOpps.length} more opportunities (not analyzed for liquidity)`);
      console.log('');
    }

    // Liquidity summary
    if (liquidityAnalyses.length > 0) {
      const liqSummary = summarizeLiquidity(liquidityAnalyses);
      console.log('─'.repeat(70));
      console.log('Liquidity Summary (Top 10)');
      console.log('─'.repeat(70));
      console.log(`  Opportunities with liquidity: ${liqSummary.withLiquidity}/${liqSummary.totalOpportunities}`);
      console.log(`  Total deployable capital: $${liqSummary.totalDeployableCapital.toFixed(2)}`);
      console.log(`  Total potential profit: $${liqSummary.totalPotentialProfit.toFixed(2)}`);
      if (liqSummary.totalDeployableCapital > 0) {
        console.log(`  Average profit: ${liqSummary.avgProfitPct.toFixed(2)}%`);
      }
      console.log(`  Opportunities >$100: ${liqSummary.over100}`);
      console.log(`  Opportunities >$1000: ${liqSummary.over1000}`);
      console.log('');
    }
  }

  // Summary
  const arbSummary = summarizeOpportunities(arbitrageOpps);

  console.log('═'.repeat(70));
  console.log('Summary');
  console.log('═'.repeat(70));
  console.log(`Total mappings checked: ${matchedPairs.length}`);
  console.log(`Found on both platforms: ${bothPlatforms.length}`);
  console.log(`Polymarket only: ${matchedPairs.filter(p => p.polymarket.found && !p.kalshi.found).length}`);
  console.log(`Kalshi only: ${matchedPairs.filter(p => !p.polymarket.found && p.kalshi.found).length}`);
  console.log(`Not found: ${matchedPairs.filter(p => !p.polymarket.found && !p.kalshi.found).length}`);
  console.log('');
  console.log('Market-Level Matching:');
  console.log(`  Total market pairs matched: ${allMarketPairs.length}`);
  console.log(`  Arbitrage opportunities: ${arbSummary.total}`);
  console.log(`    - Guaranteed profit: ${arbSummary.guaranteed}`);
  console.log(`    - Simple (>2% spread): ${arbSummary.simple}`);
  if (arbSummary.total > 0) {
    console.log(`    - Max spread: ${arbSummary.maxSpreadPct.toFixed(1)}%`);
    console.log(`    - Avg spread: ${arbSummary.avgSpreadPct.toFixed(1)}%`);
  }
}

main().catch(console.error);
