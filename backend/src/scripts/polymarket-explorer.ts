/**
 * Polymarket API Explorer
 * Explores the Gamma API and CLOB API to understand data models
 */

import type {
  PolymarketEvent,
  PolymarketMarket,
  ClobOrderBook,
  EventSummary,
  MarketSummary,
} from '../types/polymarket.js';

// API Base URLs
const GAMMA_API_URL = 'https://gamma-api.polymarket.com';
const CLOB_API_URL = 'https://clob.polymarket.com';

// ============ Gamma API Functions ============

async function fetchEvents(limit = 20, active = true): Promise<PolymarketEvent[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    active: active.toString(),
    closed: 'false',
  });

  const response = await fetch(`${GAMMA_API_URL}/events?${params}`);
  if (!response.ok) {
    throw new Error(`Gamma API error: ${response.status} ${response.statusText}`);
  }

  const events: PolymarketEvent[] = await response.json();
  return events;
}

async function fetchMarkets(limit = 20, active = true): Promise<PolymarketMarket[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    active: active.toString(),
    closed: 'false',
  });

  const response = await fetch(`${GAMMA_API_URL}/markets?${params}`);
  if (!response.ok) {
    throw new Error(`Gamma API error: ${response.status} ${response.statusText}`);
  }

  const markets: PolymarketMarket[] = await response.json();
  return markets;
}

async function searchEvents(query: string, limit = 10): Promise<PolymarketEvent[]> {
  const params = new URLSearchParams({
    title_contains: query,
    limit: limit.toString(),
    active: 'true',
    closed: 'false',
  });

  const response = await fetch(`${GAMMA_API_URL}/events?${params}`);
  if (!response.ok) {
    throw new Error(`Gamma API error: ${response.status} ${response.statusText}`);
  }

  const events: PolymarketEvent[] = await response.json();
  return events;
}

// ============ CLOB API Functions ============

async function fetchOrderBook(tokenId: string): Promise<ClobOrderBook | null> {
  try {
    const response = await fetch(`${CLOB_API_URL}/book?token_id=${tokenId}`);
    if (!response.ok) {
      console.warn(`CLOB API error for token ${tokenId}: ${response.status}`);
      return null;
    }

    const orderBook: ClobOrderBook = await response.json();
    return orderBook;
  } catch (error) {
    console.warn(`Failed to fetch order book for ${tokenId}:`, error);
    return null;
  }
}

async function fetchPrice(tokenId: string): Promise<string | null> {
  try {
    const response = await fetch(`${CLOB_API_URL}/price?token_id=${tokenId}&side=buy`);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.price;
  } catch {
    return null;
  }
}

async function fetchMidpoint(tokenId: string): Promise<string | null> {
  try {
    const response = await fetch(`${CLOB_API_URL}/midpoint?token_id=${tokenId}`);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.mid;
  } catch {
    return null;
  }
}

// ============ JSON Parsing Helpers ============

function parseJsonString<T>(jsonStr: string | T[], fallback: T[]): T[] {
  if (Array.isArray(jsonStr)) return jsonStr;
  if (!jsonStr || typeof jsonStr !== 'string') return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

function parseNumber(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  return parseFloat(value) || 0;
}

// ============ Data Processing Functions ============

function summarizeMarket(market: PolymarketMarket): MarketSummary {
  const prices = parseJsonString<string>(market.outcomePrices, ['0', '0']);
  const tokenIds = parseJsonString<string>(market.clobTokenIds, []);

  return {
    id: market.id,
    question: market.question,
    yesPrice: parseFloat(prices[0]) || 0,
    noPrice: parseFloat(prices[1]) || 0,
    volume: market.volumeNum ?? parseNumber(market.volume),
    liquidity: market.liquidityNum ?? parseNumber(market.liquidity),
    active: market.active,
    clobTokenIds: tokenIds,
  };
}

function summarizeEvent(event: PolymarketEvent): EventSummary {
  const markets = (event.markets ?? []).map(summarizeMarket);

  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    marketCount: markets.length,
    totalVolume: parseNumber(event.volume),
    totalLiquidity: parseNumber(event.liquidity),
    markets,
  };
}

// ============ Display Functions ============

function printDivider(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(` ${title}`);
  console.log('='.repeat(60));
}

function printEventSummary(event: EventSummary) {
  console.log(`\n[Event] ${event.title}`);
  console.log(`  ID: ${event.id}`);
  console.log(`  Slug: ${event.slug}`);
  console.log(`  Markets: ${event.marketCount}`);
  console.log(`  Volume: $${event.totalVolume.toLocaleString()}`);
  console.log(`  Liquidity: $${event.totalLiquidity.toLocaleString()}`);

  for (const market of event.markets) {
    console.log(`\n  [Market] ${market.question}`);
    console.log(`    YES: $${market.yesPrice.toFixed(2)} | NO: $${market.noPrice.toFixed(2)}`);
    console.log(`    Volume: $${market.volume.toLocaleString()}`);
    console.log(`    CLOB Tokens: ${market.clobTokenIds.length > 0 ? market.clobTokenIds.join(', ').slice(0, 50) + '...' : 'N/A'}`);
  }
}

function printOrderBook(orderBook: ClobOrderBook) {
  console.log(`\n[Order Book] Token: ${orderBook.asset_id.slice(0, 20)}...`);
  console.log(`  Timestamp: ${new Date(parseInt(orderBook.timestamp)).toISOString()}`);
  console.log(`  Last Trade: $${orderBook.last_trade_price ?? 'N/A'}`);

  const topBids = (orderBook.bids ?? []).slice(0, 3);
  const topAsks = (orderBook.asks ?? []).slice(0, 3);

  console.log('  Top Bids:');
  if (topBids.length === 0) {
    console.log('    (empty)');
  } else {
    for (const bid of topBids) {
      console.log(`    $${parseFloat(bid.price).toFixed(3)} x ${parseFloat(bid.size).toFixed(0)}`);
    }
  }

  console.log('  Top Asks:');
  if (topAsks.length === 0) {
    console.log('    (empty)');
  } else {
    for (const ask of topAsks) {
      console.log(`    $${parseFloat(ask.price).toFixed(3)} x ${parseFloat(ask.size).toFixed(0)}`);
    }
  }

  if (topBids.length > 0 && topAsks.length > 0) {
    const spread = parseFloat(topAsks[0].price) - parseFloat(topBids[0].price);
    console.log(`  Spread: $${spread.toFixed(4)}`);
  }
}

// ============ Main Exploration ============

async function main() {
  console.log('Polymarket API Explorer');
  console.log('=======================\n');

  // 1. Fetch active events
  printDivider('FETCHING ACTIVE EVENTS (Gamma API)');
  try {
    const events = await fetchEvents(5, true);
    console.log(`Fetched ${events.length} events`);

    for (const event of events) {
      const summary = summarizeEvent(event);
      printEventSummary(summary);
    }
  } catch (error) {
    console.error('Failed to fetch events:', error);
  }

  // 2. Fetch top markets by volume
  printDivider('FETCHING TOP MARKETS (Gamma API)');
  try {
    const markets = await fetchMarkets(5, true);
    console.log(`Fetched ${markets.length} markets`);

    for (const market of markets) {
      const summary = summarizeMarket(market);
      console.log(`\n[Market] ${summary.question}`);
      console.log(`  YES: $${summary.yesPrice.toFixed(2)} | NO: $${summary.noPrice.toFixed(2)}`);
      console.log(`  Volume: $${summary.volume.toLocaleString()}`);
      console.log(`  Liquidity: $${summary.liquidity.toLocaleString()}`);
    }
  } catch (error) {
    console.error('Failed to fetch markets:', error);
  }

  // 3. Test search functionality
  printDivider('TESTING SEARCH (Gamma API)');
  const searchTerms = ['election', 'bitcoin', 'fed'];
  for (const term of searchTerms) {
    try {
      const results = await searchEvents(term, 2);
      console.log(`\nSearch "${term}": ${results.length} results`);
      for (const event of results) {
        console.log(`  - ${event.title.slice(0, 60)}...`);
      }
    } catch (error) {
      console.error(`Search "${term}" failed:`, error);
    }
  }

  // 4. Explore CLOB API with a sample market
  printDivider('EXPLORING CLOB API (Order Book)');
  try {
    const markets = await fetchMarkets(1, true);
    const tokenIds = parseJsonString<string>(markets[0]?.clobTokenIds, []);
    if (markets.length > 0 && tokenIds.length > 0) {
      const tokenId = tokenIds[0];
      console.log(`\nFetching order book for market: ${markets[0].question.slice(0, 50)}...`);

      const orderBook = await fetchOrderBook(tokenId);
      if (orderBook) {
        printOrderBook(orderBook);
      }

      // Also fetch midpoint
      const midpoint = await fetchMidpoint(tokenId);
      if (midpoint) {
        console.log(`\n  Midpoint price: $${parseFloat(midpoint).toFixed(4)}`);
      }
    } else {
      console.log('No markets with CLOB tokens found');
    }
  } catch (error) {
    console.error('CLOB exploration failed:', error);
  }

  // 5. Print raw API response sample
  printDivider('RAW API RESPONSE SAMPLE');
  try {
    const events = await fetchEvents(1, true);
    if (events.length > 0) {
      console.log('\nSample Event JSON structure:');
      console.log(JSON.stringify(events[0], null, 2).slice(0, 2000) + '...');
    }
  } catch (error) {
    console.error('Failed to fetch sample:', error);
  }

  printDivider('EXPLORATION COMPLETE');
  console.log('\nKey findings:');
  console.log('- Events contain multiple markets (binary outcomes)');
  console.log('- Prices are 0-1 representing probability');
  console.log('- clobTokenIds link markets to CLOB order book');
  console.log('- Order book shows bid/ask with price and size');
}

main().catch(console.error);
