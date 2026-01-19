/**
 * Test script for Polymarket WebSocket orderbook subscription.
 *
 * Usage: npx tsx src/scripts/test-polymarket-websocket.ts [token_id1] [token_id2] ...
 * Example: npx tsx src/scripts/test-polymarket-websocket.ts 101676997363687199724245607342877036148401850938023978421879460310389391082353
 */

import { PolymarketWebSocketClient, type PolymarketOrderBookState, formatPrice } from '../websocket/index.js';

// Default token IDs (from "Will Trump deport less than 250,000?" market)
const DEFAULT_TOKEN_IDS = [
  '101676997363687199724245607342877036148401850938023978421879460310389391082353',
  '4153292802911610701832309484716814274802943278345248636922528170020319407796',
];

// ============ Orderbook Visualization ============

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function createBar(qty: number, maxQty: number): string {
  const barLength = Math.ceil((qty / maxQty) * 10);
  return '█'.repeat(Math.max(1, barLength));
}

function truncateId(id: string): string {
  if (id.length > 20) {
    return id.slice(0, 8) + '...' + id.slice(-8);
  }
  return id;
}

/**
 * Print orderbook for a Polymarket token.
 * Shows ASKS (what you can buy at) sorted by price ascending (best first).
 */
function printOrderbook(orderbook: PolymarketOrderBookState): void {
  // Asks sorted ascending (lowest/best ask first)
  const asks = [...orderbook.asks.entries()].sort((a, b) => a[0] - b[0]);
  // Bids sorted descending (highest/best bid first)
  const bids = [...orderbook.bids.entries()].sort((a, b) => b[0] - a[0]);

  // Find max quantity for bar scaling
  const allQuantities = [...asks.map(([, q]) => q), ...bids.map(([, q]) => q)];
  const maxQty = Math.max(...allQuantities, 1);

  // Best prices
  const bestAsk = asks[0]?.[0] ?? 1000;
  const bestBid = bids[0]?.[0] ?? 0;
  const spread = bestAsk - bestBid;

  // Top 5 levels
  const topAsks = asks.slice(0, 5);
  const topBids = bids.slice(0, 5);

  console.log(`\n┌${'─'.repeat(66)}┐`);
  console.log(`│ Token: ${truncateId(orderbook.assetId).padEnd(56)} │`);
  console.log(`├${'─'.repeat(66)}┤`);
  console.log(`│ ${'ASKS (buy at)'.padEnd(31)} │ ${'BIDS (sell at)'.padEnd(31)} │`);
  console.log(`├${'─'.repeat(33)}┼${'─'.repeat(32)}┤`);

  for (let i = 0; i < 5; i++) {
    const askLevel = topAsks[i];
    const bidLevel = topBids[i];

    const askStr = askLevel
      ? `${formatPrice(askLevel[0]).padStart(6)} ${createBar(askLevel[1], maxQty).padEnd(10)} ${formatNumber(askLevel[1]).padStart(10)}`
      : ''.padEnd(31);

    const bidStr = bidLevel
      ? `${formatPrice(bidLevel[0]).padStart(6)} ${createBar(bidLevel[1], maxQty).padEnd(10)} ${formatNumber(bidLevel[1]).padStart(10)}`
      : ''.padEnd(31);

    console.log(`│ ${askStr} │ ${bidStr} │`);
  }

  console.log(`├${'─'.repeat(66)}┤`);
  const summary = `│ Best Ask: ${formatPrice(bestAsk)}  │  Best Bid: ${formatPrice(bestBid)}  │  Spread: ${formatPrice(spread)}`;
  console.log(summary.padEnd(67) + '│');
  console.log(`└${'─'.repeat(66)}┘`);
}

function printAllOrderbooks(orderbooks: Map<string, PolymarketOrderBookState>): void {
  console.clear();
  console.log('═'.repeat(68));
  console.log(' POLYMARKET ORDERBOOK MONITOR - ' + new Date().toLocaleTimeString());
  console.log('═'.repeat(68));

  for (const [, orderbook] of orderbooks) {
    printOrderbook(orderbook);
  }

  console.log('\nPress Ctrl+C to exit');
}

// ============ Main ============

function main() {
  const tokenIds = process.argv.slice(2);
  const tokensToSubscribe = tokenIds.length > 0 ? tokenIds : DEFAULT_TOKEN_IDS;

  console.log(`Subscribing to ${tokensToSubscribe.length} token(s):\n`);
  tokensToSubscribe.forEach((t) => console.log(`  - ${truncateId(t)}`));
  console.log('');

  const client = new PolymarketWebSocketClient();

  // Connection events
  client.on('connected', () => {
    console.log('Connected! Subscribing to orderbooks...\n');
    client.subscribeMany(tokensToSubscribe);
  });

  client.on('disconnected', (code, reason) => {
    console.log(`Disconnected: ${code} - ${reason}`);
  });

  client.on('error', (err) => {
    console.error('Error:', err.message);
  });

  // Subscription events
  client.on('subscribed', (assetId) => {
    console.log(`Subscribed to ${truncateId(assetId)}`);
  });

  // Orderbook events - refresh display on any update
  client.on('orderbook', () => {
    const allOrderbooks = client.getAllOrderbooks();
    if (allOrderbooks.size > 0) {
      printAllOrderbooks(allOrderbooks);
    }
  });

  // Connect
  console.log('Connecting to Polymarket WebSocket...');
  client.connect();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    client.disconnect();
    process.exit(0);
  });
}

main();
