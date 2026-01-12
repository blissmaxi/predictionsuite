/**
 * List Market Titles
 *
 * Logs all market titles/questions from both Polymarket and Kalshi.
 */

import { fetchAllPolymarketEvents } from '../connectors/polymarket-connector.js';
import { fetchAllKalshiEvents } from '../connectors/kalshi-connector.js';

const MAX_EVENTS = 100; // Adjust as needed

async function main() {
  console.log('Fetching events...\n');

  const [polyResult, kalshiResult] = await Promise.all([
    fetchAllPolymarketEvents({ maxEvents: MAX_EVENTS }),
    fetchAllKalshiEvents({ maxEvents: MAX_EVENTS }),
  ]);

  // Count total markets
  const polyMarketCount = polyResult.data.reduce((sum, e) => sum + e.markets.length, 0);
  const kalshiMarketCount = kalshiResult.data.reduce((sum, e) => sum + e.markets.length, 0);

  console.log(`Polymarket: ${polyResult.data.length} events, ${polyMarketCount} markets`);
  console.log(`Kalshi: ${kalshiResult.data.length} events, ${kalshiMarketCount} markets`);

  // List Polymarket markets
  console.log('\n========== POLYMARKET MARKETS ==========\n');
  let polyIdx = 1;
  for (const event of polyResult.data.slice(0, 30)) {
    console.log(`Event: "${event.title}"`);
    for (const market of event.markets) {
      console.log(`  ${polyIdx}. ${market.question}`);
      polyIdx++;
    }
    console.log('');
  }

  // List Kalshi markets
  console.log('\n========== KALSHI MARKETS ==========\n');
  let kalshiIdx = 1;
  for (const event of kalshiResult.data.slice(0, 30)) {
    console.log(`Event: "${event.title}"`);
    for (const market of event.markets) {
      console.log(`  ${kalshiIdx}. ${market.question}`);
      kalshiIdx++;
    }
    console.log('');
  }
}

main().catch(console.error);
