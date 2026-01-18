/**
 * Test script for Kalshi WebSocket orderbook subscription.
 *
 * Usage: npx tsx src/scripts/test-kalshi-websocket.ts [market_ticker1] [market_ticker2] ...
 * Example: npx tsx src/scripts/test-kalshi-websocket.ts KXNFLGAME-26JAN18HOUNE-NE KXNFLGAME-26JAN18HOUNE-HOU
 */

import { config } from 'dotenv';
import { KalshiWebSocketClient, type OrderBookState } from '../websocket/index.js';

// Load environment variables
config();

// Default markets (NFL playoff game - both sides)
const DEFAULT_TICKERS = [
  'KXNFLGAME-26JAN18HOUNE-NE',
  'KXNFLGAME-26JAN18HOUNE-HOU',
];

// ============ Orderbook Visualization ============

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function createBar(qty: number, maxQty: number): string {
  const barLength = Math.ceil((qty / maxQty) * 10);
  return '█'.repeat(Math.max(1, barLength));
}

/**
 * Print orderbook for a market.
 *
 * Kalshi websocket provides BIDS only for YES and NO sides.
 * In binary markets:
 *   - YES ask = 100 - NO bid (to buy YES, take other side of NO bid)
 *   - NO ask = 100 - YES bid (to buy NO, take other side of YES bid)
 */
function printOrderbook(ticker: string, orderbook: OrderBookState): void {
  // Raw bids from websocket
  const yesBids = [...orderbook.yes.entries()].sort((a, b) => b[0] - a[0]);
  const noBids = [...orderbook.no.entries()].sort((a, b) => b[0] - a[0]);

  // Derive ASKs (what you can BUY at)
  // YES ask = 100 - NO bid, sorted ascending (best/lowest ask first)
  const yesAsks = noBids
    .map(([price, qty]) => [100 - price, qty] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  // NO ask = 100 - YES bid, sorted ascending (best/lowest ask first)
  const noAsks = yesBids
    .map(([price, qty]) => [100 - price, qty] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  // Find max quantity for bar scaling
  const allQuantities = [...yesAsks.map(([, q]) => q), ...noAsks.map(([, q]) => q)];
  const maxQty = Math.max(...allQuantities, 1);

  // Best prices (lowest ask = best price to buy)
  const bestYesAsk = yesAsks[0]?.[0] ?? 100;
  const bestNoAsk = noAsks[0]?.[0] ?? 100;
  const bestYesBid = yesBids[0]?.[0] ?? 0;
  const bestNoBid = noBids[0]?.[0] ?? 0;

  // Top 5 ask levels
  const topYesAsks = yesAsks.slice(0, 5);
  const topNoAsks = noAsks.slice(0, 5);

  console.log(`\n┌${'─'.repeat(62)}┐`);
  console.log(`│ ${ticker.padEnd(60)} │`);
  console.log(`├${'─'.repeat(62)}┤`);
  console.log(`│ ${'YES ASKS (buy YES at)'.padEnd(29)} │ ${'NO ASKS (buy NO at)'.padEnd(29)} │`);
  console.log(`├${'─'.repeat(31)}┼${'─'.repeat(30)}┤`);

  for (let i = 0; i < 5; i++) {
    const yesLevel = topYesAsks[i];
    const noLevel = topNoAsks[i];

    const yesStr = yesLevel
      ? `${yesLevel[0].toString().padStart(2)}¢ ${createBar(yesLevel[1], maxQty).padEnd(10)} ${formatNumber(yesLevel[1]).padStart(6)}`
      : ''.padEnd(29);

    const noStr = noLevel
      ? `${noLevel[0].toString().padStart(2)}¢ ${createBar(noLevel[1], maxQty).padEnd(10)} ${formatNumber(noLevel[1]).padStart(6)}`
      : ''.padEnd(29);

    console.log(`│ ${yesStr} │ ${noStr} │`);
  }

  console.log(`├${'─'.repeat(62)}┤`);
  const summary = `│ Buy YES: ${bestYesAsk}¢  │  Buy NO: ${bestNoAsk}¢  │  YES+NO: ${bestYesAsk + bestNoAsk}¢`;
  console.log(summary.padEnd(63) + '│');
  console.log(`└${'─'.repeat(62)}┘`);
}

function printAllOrderbooks(orderbooks: Map<string, OrderBookState>): void {
  console.clear();
  console.log('═'.repeat(62));
  console.log(' KALSHI ORDERBOOK MONITOR - ' + new Date().toLocaleTimeString());
  console.log('═'.repeat(62));

  for (const [ticker, orderbook] of orderbooks) {
    printOrderbook(ticker, orderbook);
  }

  console.log('\nPress Ctrl+C to exit');
}

// ============ Main ============

function main() {
  const tickers = process.argv.slice(2);
  const marketsToSubscribe = tickers.length > 0 ? tickers : DEFAULT_TICKERS;

  console.log(`Subscribing to ${marketsToSubscribe.length} market(s):\n`);
  marketsToSubscribe.forEach((t) => console.log(`  - ${t}`));
  console.log('');

  const client = new KalshiWebSocketClient();

  // Connection events
  client.on('connected', () => {
    console.log('Connected! Subscribing to orderbooks...\n');
    client.subscribeMany(marketsToSubscribe);
  });

  client.on('disconnected', (code, reason) => {
    console.log(`Disconnected: ${code} - ${reason}`);
  });

  client.on('error', (err) => {
    console.error('Error:', err.message);
  });

  // Subscription events
  client.on('subscribed', (marketTicker, sid) => {
    console.log(`Subscribed to ${marketTicker} (sid=${sid})`);
  });

  // Orderbook events - refresh display on any update
  client.on('orderbook', () => {
    const allOrderbooks = client.getAllOrderbooks();
    if (allOrderbooks.size > 0) {
      printAllOrderbooks(allOrderbooks);
    }
  });

  // Connect
  console.log('Connecting...');
  client.connect();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    client.disconnect();
    process.exit(0);
  });
}

main();
