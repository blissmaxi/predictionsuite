/**
 * Test Order Book Fetching
 *
 * Investigates order book fetching for specific markets on both platforms.
 * Also traces through the matching pipeline to identify where data is lost.
 */

import {
  matchMarketsWithinEvent,
  type MarketData,
} from '../matching/market-matcher.js';
import {
  fetchPolymarketOrderBook,
  fetchKalshiOrderBook,
} from '../orderbook/fetcher.js';
import {
  findArbitrageOpportunities,
} from '../arbitrage/calculator.js';

const POLYMARKET_GAMMA_URL = 'https://gamma-api.polymarket.com';
const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';

// ============ Polymarket ============

async function fetchPolymarketMarkets(slug: string): Promise<MarketData[]> {
  console.log(`\nFetching Polymarket: ${slug}`);

  const response = await fetch(`${POLYMARKET_GAMMA_URL}/events?slug=${slug}`);
  const data = await response.json();

  if (data.length === 0) {
    console.log('Event not found');
    return [];
  }

  const event = data[0];
  console.log(`Event: ${event.title} (${event.markets?.length || 0} markets)`);

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

  return markets;
}

// ============ Kalshi ============

async function fetchKalshiMarkets(seriesTicker: string, eventTicker: string): Promise<MarketData[]> {
  console.log(`\nFetching Kalshi: Series ${seriesTicker}, Event ${eventTicker}`);

  const response = await fetch(
    `${KALSHI_API_URL}/events?limit=100&with_nested_markets=true&status=open&series_ticker=${seriesTicker}`
  );
  const data = await response.json();

  const events = data.events || [];
  console.log(`Found ${events.length} events in series`);

  for (const event of events) {
    if (event.event_ticker?.toUpperCase() === eventTicker.toUpperCase()) {
      console.log(`Event: ${event.title} (${event.markets?.length || 0} markets)`);

      const markets: MarketData[] = (event.markets || [])
        .filter((m: any) => m.status === 'active')
        .map((m: any) => ({
          question: m.yes_sub_title || m.title || 'Unknown',
          yesPrice: parseFloat(m.last_price_dollars || '0') || 0,
          volume: m.volume || 0,
          ticker: m.ticker,
        }));

      return markets;
    }
  }

  console.log('Event not found');
  return [];
}

// ============ Main ============

async function main() {
  console.log('Order Book Pipeline Investigation');
  console.log('==================================\n');

  // Test: UEFA Champions League - Barcelona
  console.log('='.repeat(70));
  console.log('TEST: Barcelona - UEFA Champions League');
  console.log('='.repeat(70));

  // Step 1: Fetch markets from both platforms
  const polyMarkets = await fetchPolymarketMarkets('uefa-champions-league-winner');
  const kalshiMarkets = await fetchKalshiMarkets('KXUCL', 'KXUCL-26');

  // Step 2: Find Barcelona in both
  const polyBarcelona = polyMarkets.find(m =>
    m.question.toLowerCase().includes('barcelona')
  );
  const kalshiBarcelona = kalshiMarkets.find(m =>
    m.question.toLowerCase().includes('barcelona')
  );

  console.log('\n--- Raw Market Data ---');
  console.log('Polymarket Barcelona:');
  console.log(`  Question: ${polyBarcelona?.question}`);
  console.log(`  Yes Price: ${polyBarcelona?.yesPrice}`);
  console.log(`  Token IDs: ${JSON.stringify(polyBarcelona?.tokenIds)}`);
  console.log(`  Has tokenIds: ${!!polyBarcelona?.tokenIds}`);

  console.log('\nKalshi Barcelona:');
  console.log(`  Question: ${kalshiBarcelona?.question}`);
  console.log(`  Yes Price: ${kalshiBarcelona?.yesPrice}`);
  console.log(`  Ticker: ${kalshiBarcelona?.ticker}`);
  console.log(`  Has ticker: ${!!kalshiBarcelona?.ticker}`);

  // Step 3: Run matching
  console.log('\n--- Market Matching ---');
  const pairs = matchMarketsWithinEvent(
    polyMarkets,
    kalshiMarkets,
    'sports',
    'UEFA Champions League'
  );

  console.log(`Total pairs matched: ${pairs.length}`);

  // Find Barcelona pair
  const barcelonaPair = pairs.find(p =>
    p.matchedEntity.toLowerCase().includes('barcelona')
  );

  if (barcelonaPair) {
    console.log('\nBarcelona Pair:');
    console.log(`  Matched Entity: ${barcelonaPair.matchedEntity}`);
    console.log(`  Polymarket Question: ${barcelonaPair.polymarket.question}`);
    console.log(`  Polymarket tokenIds: ${JSON.stringify(barcelonaPair.polymarket.tokenIds)}`);
    console.log(`  Kalshi Question: ${barcelonaPair.kalshi.question}`);
    console.log(`  Kalshi ticker: ${barcelonaPair.kalshi.ticker}`);
    console.log(`  Spread: ${barcelonaPair.spread}`);

    // Step 4: Try fetching order books
    console.log('\n--- Order Book Fetching ---');

    const polyTokenIds = barcelonaPair.polymarket.tokenIds;
    const kalshiTicker = barcelonaPair.kalshi.ticker;

    console.log(`Polymarket tokenIds: ${JSON.stringify(polyTokenIds)}`);
    console.log(`Kalshi ticker: ${kalshiTicker}`);

    if (polyTokenIds && polyTokenIds.length >= 2) {
      console.log('\nFetching Polymarket order book...');
      const polyBook = await fetchPolymarketOrderBook(polyTokenIds[0], polyTokenIds[1]);
      console.log(`  YES Asks: ${polyBook.yesAsks.length} levels`);
      console.log(`  NO Asks: ${polyBook.noAsks.length} levels`);
      if (polyBook.yesAsks.length > 0) {
        console.log(`  Best YES Ask: ${polyBook.yesAsks[0].price} (${polyBook.yesAsks[0].size} shares)`);
      }
    } else {
      console.log('\n❌ Cannot fetch Polymarket order book - missing tokenIds');
    }

    if (kalshiTicker) {
      console.log('\nFetching Kalshi order book...');
      const kalshiBook = await fetchKalshiOrderBook(kalshiTicker);
      console.log(`  YES Asks: ${kalshiBook.yesAsks.length} levels`);
      console.log(`  NO Asks: ${kalshiBook.noAsks.length} levels`);
      if (kalshiBook.noAsks.length > 0) {
        console.log(`  Best NO Ask: ${kalshiBook.noAsks[0].price} (${kalshiBook.noAsks[0].size} shares)`);
      }
    } else {
      console.log('\n❌ Cannot fetch Kalshi order book - missing ticker');
    }

    // Step 5: Run arbitrage detection
    console.log('\n--- Arbitrage Detection ---');
    const opportunities = findArbitrageOpportunities([barcelonaPair]);
    console.log(`Opportunities found: ${opportunities.length}`);

    if (opportunities.length > 0) {
      const opp = opportunities[0];
      console.log(`  Type: ${opp.type}`);
      console.log(`  Profit: ${opp.profitPct.toFixed(2)}%`);
      console.log(`  Pair tokenIds: ${JSON.stringify(opp.pair.polymarket.tokenIds)}`);
      console.log(`  Pair ticker: ${opp.pair.kalshi.ticker}`);
    }

  } else {
    console.log('\n❌ Barcelona pair not found in matches!');
    console.log('\nAvailable matched entities:');
    pairs.slice(0, 10).forEach(p => {
      console.log(`  - ${p.matchedEntity}`);
    });
  }

  // Also test with San Antonio Spurs (known working)
  console.log('\n\n');
  console.log('='.repeat(70));
  console.log('CONTROL TEST: San Antonio Spurs - NBA (known working)');
  console.log('='.repeat(70));

  const polyNBA = await fetchPolymarketMarkets('2026-nba-champion');
  const kalshiNBA = await fetchKalshiMarkets('KXNBA', 'KXNBA-26');

  const polySpurs = polyNBA.find(m =>
    m.question.toLowerCase().includes('san antonio') ||
    m.question.toLowerCase().includes('spurs')
  );
  const kalshiSpurs = kalshiNBA.find(m =>
    m.question.toLowerCase().includes('san antonio')
  );

  console.log('\n--- Raw Market Data ---');
  console.log('Polymarket Spurs:');
  console.log(`  Question: ${polySpurs?.question}`);
  console.log(`  Token IDs: ${JSON.stringify(polySpurs?.tokenIds)}`);

  console.log('\nKalshi Spurs:');
  console.log(`  Question: ${kalshiSpurs?.question}`);
  console.log(`  Ticker: ${kalshiSpurs?.ticker}`);

  const nbaPairs = matchMarketsWithinEvent(
    polyNBA,
    kalshiNBA,
    'sports',
    'NBA Champion'
  );

  const spursPair = nbaPairs.find(p =>
    p.matchedEntity.toLowerCase().includes('san antonio')
  );

  if (spursPair) {
    console.log('\n--- Matched Pair ---');
    console.log(`  Polymarket tokenIds: ${JSON.stringify(spursPair.polymarket.tokenIds)}`);
    console.log(`  Kalshi ticker: ${spursPair.kalshi.ticker}`);
  }
}

main().catch(console.error);
