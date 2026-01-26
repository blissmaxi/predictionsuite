/**
 * Test script for the ArbitrageEngine
 *
 * Usage:
 *   npx tsx src/scripts/test-arbitrage-engine.ts
 *
 * Prerequisites:
 *   - KALSHI_API_ID environment variable set (via .env file)
 *   - kalshi-api-rsa private key file in project root
 *
 * This script demonstrates real-time arbitrage detection between
 * Kalshi and Polymarket markets.
 */

import { config } from 'dotenv';

// Load environment variables from .env file
config();

import { ArbitrageEngine } from '../arbitrage/engine.js';
import type { ArbitrageOpportunity, MarketPairMapping, NormalizedOrderbook, Platform } from '../arbitrage/types.js';

// ============ Configuration ============

// Example market pairs - replace with actual market IDs
const TEST_PAIRS: MarketPairMapping[] = [
  // To use this script, add real market pairs here:
  {
    id: 'nfl-superbowl-2026-seahawks',
    kalshiTicker: 'KXSB-26-SEA',
    polymarketYesToken: '91737931954079461205792748723730956466398437395923414328893692961489566016241',
    polymarketNoToken: '47021554520147489198499363137978179318351470490672224768430579421357197997727',
    description: 'NFL Super Bowl: Seahawks win',
  },
];

// ============ Formatting Helpers ============

function formatPrice(price: number): string {
  return `${(price * 100).toFixed(1)}¢`;
}

function formatOrderbook(ob: NormalizedOrderbook): string {

  console.log(ob);
  const yesAsk = ob.yesAsks[0];
  const noAsk = ob.noAsks[0];

  const yesAskStr = yesAsk ? `${formatPrice(yesAsk.price)} (${yesAsk.size.toLocaleString('en-US', { maximumFractionDigits: 2 })})` : 'none';
  const noAskStr = noAsk ? `${formatPrice(noAsk.price)} (${noAsk.size.toLocaleString('en-US', { maximumFractionDigits: 2 })})` : 'none';

  return `YES ask: ${yesAskStr} | NO ask: ${noAskStr}`;
}

function formatOpportunity(opp: ArbitrageOpportunity): string {
  return `
┌─────────────────────────────────────────────────────────────┐
│ ARBITRAGE OPPORTUNITY                                       │
├─────────────────────────────────────────────────────────────┤
│ Pair:        ${opp.pairId.padEnd(44)}│
│ Type:        ${opp.type.padEnd(44)}│
│ Spread:      ${(opp.spreadPercent.toFixed(2) + '%').padEnd(44)}│
├─────────────────────────────────────────────────────────────┤
│ Strategy:                                                   │
│   Buy YES on ${opp.buyYesPlatform.padEnd(12)} @ ${formatPrice(opp.buyYesPrice).padEnd(26)}│
│   Buy NO on  ${opp.buyNoPlatform.padEnd(12)} @ ${formatPrice(opp.buyNoPrice).padEnd(26)}│
├─────────────────────────────────────────────────────────────┤
│ Max Contracts:    ${opp.maxContracts.toFixed(0).padEnd(39)}│
│ Potential Profit: $${opp.potentialProfit.toFixed(2).padEnd(38)}│
└─────────────────────────────────────────────────────────────┘`;
}

// ============ Main ============

async function main(): Promise<void> {
  console.log('ArbitrageEngine Test Script');
  console.log('===========================\n');

  if (TEST_PAIRS.length === 0) {
    console.log('No market pairs configured.');
    console.log('\nTo use this script, edit the TEST_PAIRS array with real market IDs:');
    console.log('  - Kalshi ticker (e.g., KXNFLGAME-26JAN18HOUNE-NE)');
    console.log('  - Polymarket YES token ID');
    console.log('  - Polymarket NO token ID');
    console.log('\nYou can find Polymarket token IDs using:');
    console.log('  npx tsx src/scripts/polymarket-lookup.ts <slug>');
    console.log('\nYou can find Kalshi tickers on their website or API.');
    process.exit(0);
  }

  console.log(`Monitoring ${TEST_PAIRS.length} market pair(s):\n`);
  for (const pair of TEST_PAIRS) {
    console.log(`  - ${pair.id}: ${pair.description || 'No description'}`);
  }
  console.log('');

  const engine = new ArbitrageEngine({
    pairs: TEST_PAIRS,
    minSpreadPercent: 0.5, // Lower threshold for testing
    debounceMs: 100,
  });

  // Connection events
  engine.on('connected', (platform: Platform) => {
    console.log(`[${new Date().toISOString()}] Connected to ${platform}`);

    if (engine.isFullyConnected()) {
      console.log('\nBoth platforms connected. Monitoring for arbitrage...\n');
    }
  });

  engine.on('disconnected', (platform: Platform, code: number, reason: string) => {
    console.log(`[${new Date().toISOString()}] Disconnected from ${platform}: ${code} - ${reason}`);
  });

  engine.on('error', (error: Error) => {
    console.error(`[${new Date().toISOString()}] Error: ${error.message}`);
  });

  // Orderbook updates
  engine.on('orderbook_update', (platform: Platform, marketId: string, orderbook: NormalizedOrderbook) => {
    console.log(`[${platform.toUpperCase()}] ${marketId}: ${formatOrderbook(orderbook)}`);
  });

  // Arbitrage opportunities
  engine.on('opportunity', (opp: ArbitrageOpportunity) => {
    console.log(formatOpportunity(opp));
  });

  engine.on('opportunity_closed', (pairId: string) => {
    console.log(`[${new Date().toISOString()}] Opportunity closed: ${pairId}`);
  });

  // Start the engine
  console.log('Starting ArbitrageEngine...\n');
  engine.start();

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    engine.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nShutting down...');
    engine.stop();
    process.exit(0);
  });
}

main().catch(console.error);
