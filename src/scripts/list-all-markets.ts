/**
 * List All Markets
 *
 * Fetches ALL markets from Polymarket and Kalshi using pagination.
 * Shows: name, volume, YES/NO prices
 */

import { fetchAllPolymarketEvents } from '../connectors/polymarket-connector.js';
import { fetchAllKalshiEvents } from '../connectors/kalshi-connector.js';
import type { UnifiedMarket } from '../types/unified.js';

// ============ Configuration ============

// Set to 0 for unlimited (fetch all), or a number to cap
const MAX_POLYMARKET_EVENTS = 0;
const MAX_KALSHI_EVENTS = 0;

// ============ Formatting ============

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 3) + '...' : str.padEnd(len);
}

function printMarketLine(market: UnifiedMarket) {
  const event = truncate(market.eventTitle, 40);
  const name = truncate(market.question, 35);
  const yes = formatPrice(market.yesPrice);
  const no = formatPrice(market.noPrice);
  const vol = formatVolume(market.volume).padStart(8);

  console.log(`  [${event}] ${name}  YES: ${yes}  NO: ${no}  Vol: ${vol}`);
}

// ============ Progress Helpers ============

function clearLine() {
  process.stdout.write('\r\x1b[K');
}

function writeProgress(msg: string) {
  clearLine();
  process.stdout.write(msg);
}

// ============ Main ============

async function main() {
  console.log('All Prediction Markets (Fetching ALL with pagination...)\n');

  let totalMarkets = 0;
  let totalVolume = 0;
  const platformStats: { name: string; markets: number; volume: number }[] = [];

  // ============ Polymarket ============

  console.log('POLYMARKET');
  console.log('-'.repeat(90));

  try {
    writeProgress('  Fetching events...');

    const polyResult = await fetchAllPolymarketEvents({
      maxEvents: MAX_POLYMARKET_EVENTS,
      onProgress: (fetched) => {
        writeProgress(`  Fetching events... ${fetched} events`);
      },
    });

    clearLine();
    console.log(`  Fetched ${polyResult.data.length} events`);

    const polyMarkets: UnifiedMarket[] = [];
    for (const event of polyResult.data) {
      polyMarkets.push(...event.markets);
    }

    // Sort by volume descending
    polyMarkets.sort((a, b) => b.volume - a.volume);

    // Show top 50 markets to keep output manageable
    console.log(`\n  Top 50 markets by volume:`);
    for (const market of polyMarkets.slice(0, 50)) {
      printMarketLine(market);
    }

    if (polyMarkets.length > 50) {
      console.log(`\n  ... and ${polyMarkets.length - 50} more markets`);
    }

    const polyVolume = polyMarkets.reduce((sum, m) => sum + m.volume, 0);
    platformStats.push({ name: 'Polymarket', markets: polyMarkets.length, volume: polyVolume });
    totalMarkets += polyMarkets.length;
    totalVolume += polyVolume;

    console.log(`\n  Subtotal: ${polyMarkets.length} markets, ${formatVolume(polyVolume)} volume\n`);
  } catch (error) {
    clearLine();
    console.error('  Failed to fetch Polymarket:', error);
  }

  // ============ Kalshi ============

  console.log('KALSHI');
  console.log('-'.repeat(90));

  try {
    writeProgress('  Fetching events...');

    const kalshiResult = await fetchAllKalshiEvents({
      maxEvents: MAX_KALSHI_EVENTS,
      onProgress: (current, total) => {
        if (total > 0) {
          writeProgress(`  Fetching event details... ${current}/${total}`);
        } else {
          writeProgress(`  Fetching event list... ${current} events`);
        }
      },
    });

    clearLine();
    console.log(`  Fetched ${kalshiResult.data.length} events`);

    const kalshiMarkets: UnifiedMarket[] = [];
    for (const event of kalshiResult.data) {
      kalshiMarkets.push(...event.markets);
    }

    // Sort by volume descending
    kalshiMarkets.sort((a, b) => b.volume - a.volume);

    // Show top 50 markets to keep output manageable
    console.log(`\n  Top 50 markets by volume:`);
    for (const market of kalshiMarkets.slice(0, 50)) {
      printMarketLine(market);
    }

    if (kalshiMarkets.length > 50) {
      console.log(`\n  ... and ${kalshiMarkets.length - 50} more markets`);
    }

    const kalshiVolume = kalshiMarkets.reduce((sum, m) => sum + m.volume, 0);
    platformStats.push({ name: 'Kalshi', markets: kalshiMarkets.length, volume: kalshiVolume });
    totalMarkets += kalshiMarkets.length;
    totalVolume += kalshiVolume;

    console.log(`\n  Subtotal: ${kalshiMarkets.length} markets, ${formatVolume(kalshiVolume)} volume\n`);
  } catch (error) {
    clearLine();
    console.error('  Failed to fetch Kalshi:', error);
  }

  // ============ Summary ============

  console.log('='.repeat(90));
  console.log('SUMMARY');
  console.log('='.repeat(90));

  for (const stat of platformStats) {
    console.log(`  ${stat.name.padEnd(15)} ${String(stat.markets).padStart(5)} markets    ${formatVolume(stat.volume).padStart(10)} volume`);
  }

  console.log('-'.repeat(90));
  console.log(`  ${'TOTAL'.padEnd(15)} ${String(totalMarkets).padStart(5)} markets    ${formatVolume(totalVolume).padStart(10)} volume`);
  console.log();
}

main().catch(console.error);
