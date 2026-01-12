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
  type MatchResult,
} from '../matching/catalog-matcher.js';

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
        return {
          question: m.question || m.groupItemTitle || 'Unknown',
          yesPrice: parseFloat(prices[0]) || 0,
          volume: m.volumeNum || 0,
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

  // Process static mappings
  console.log('─'.repeat(70));
  console.log('Fetching Static Mappings...');
  console.log('─'.repeat(70));
  console.log('');

  const staticMatches = getAllStaticMappings();

  for (const match of staticMatches) {
    process.stdout.write(`  ${match.name}... `);

    const [polyData, kalshiData] = await Promise.all([
      fetchPolymarketEvent(match.polymarketSlug),
      fetchKalshiEventBySeries(match.kalshiTicker, match.kalshiSeries),
    ]);

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
    });

    const status = polyData && kalshiData ? '✓ Both' :
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
      });

      const status = polyData && kalshiData ? '✓ Both' :
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

  // Summary
  console.log('═'.repeat(70));
  console.log('Summary');
  console.log('═'.repeat(70));
  console.log(`Total mappings checked: ${matchedPairs.length}`);
  console.log(`Found on both platforms: ${bothPlatforms.length}`);
  console.log(`Polymarket only: ${matchedPairs.filter(p => p.polymarket.found && !p.kalshi.found).length}`);
  console.log(`Kalshi only: ${matchedPairs.filter(p => !p.polymarket.found && p.kalshi.found).length}`);
  console.log(`Not found: ${matchedPairs.filter(p => !p.polymarket.found && !p.kalshi.found).length}`);
}

main().catch(console.error);
