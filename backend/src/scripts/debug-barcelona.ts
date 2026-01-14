/**
 * Debug Barcelona Order Book
 *
 * Investigates why Barcelona shows "No liquidity" despite having orders.
 */

import {
  fetchPolymarketOrderBook,
  fetchKalshiOrderBook,
} from '../orderbook/fetcher.js';

const POLYMARKET_GAMMA_URL = 'https://gamma-api.polymarket.com';
const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';

async function main() {
  console.log('Barcelona Order Book Debug');
  console.log('==========================\n');

  // Step 1: Get market info from both platforms
  console.log('1. Fetching market info...\n');

  // Polymarket
  const polyResp = await fetch(`${POLYMARKET_GAMMA_URL}/events?slug=uefa-champions-league-winner`);
  const polyData = await polyResp.json();
  const polyEvent = polyData[0];
  const polyBarcelona = polyEvent.markets.find((m: any) =>
    m.question?.toLowerCase().includes('barcelona')
  );

  const polyTokenIds = JSON.parse(polyBarcelona.clobTokenIds);
  const polyPrices = JSON.parse(polyBarcelona.outcomePrices);

  console.log('Polymarket Barcelona:');
  console.log(`  Last Trade YES Price: ${polyPrices[0]} ($${(parseFloat(polyPrices[0]) * 100).toFixed(1)}¢)`);
  console.log(`  Last Trade NO Price: ${polyPrices[1]} ($${(parseFloat(polyPrices[1]) * 100).toFixed(1)}¢)`);
  console.log(`  YES Token ID: ${polyTokenIds[0].slice(0, 20)}...`);
  console.log(`  NO Token ID: ${polyTokenIds[1].slice(0, 20)}...`);

  // Kalshi
  const kalshiResp = await fetch(
    `${KALSHI_API_URL}/events?limit=100&with_nested_markets=true&status=open&series_ticker=KXUCL`
  );
  const kalshiData = await kalshiResp.json();
  const kalshiEvent = kalshiData.events.find((e: any) => e.event_ticker === 'KXUCL-26');
  const kalshiBarcelona = kalshiEvent.markets.find((m: any) =>
    m.yes_sub_title?.toLowerCase().includes('barcelona')
  );

  console.log('\nKalshi Barcelona:');
  console.log(`  Last Trade YES Price: ${kalshiBarcelona.last_price_dollars} ($${(parseFloat(kalshiBarcelona.last_price_dollars) * 100).toFixed(1)}¢)`);
  console.log(`  Last Trade NO Price: ${(1 - parseFloat(kalshiBarcelona.last_price_dollars)).toFixed(2)} ($${((1 - parseFloat(kalshiBarcelona.last_price_dollars)) * 100).toFixed(1)}¢)`);
  console.log(`  Ticker: ${kalshiBarcelona.ticker}`);

  // Step 2: Calculate spread from last trade prices
  console.log('\n2. Arbitrage based on LAST TRADE prices:\n');

  const polyLastYes = parseFloat(polyPrices[0]);
  const kalshiLastYes = parseFloat(kalshiBarcelona.last_price_dollars);
  const kalshiLastNo = 1 - kalshiLastYes;

  const lastTradeCost = polyLastYes + kalshiLastNo;
  const lastTradeProfit = 1 - lastTradeCost;

  console.log(`  Buy Poly YES @ ${(polyLastYes * 100).toFixed(1)}¢ (last trade)`);
  console.log(`  Buy Kalshi NO @ ${(kalshiLastNo * 100).toFixed(1)}¢ (implied from last trade)`);
  console.log(`  Total Cost: ${(lastTradeCost * 100).toFixed(1)}¢`);
  console.log(`  Profit: ${(lastTradeProfit * 100).toFixed(1)}¢ (${(lastTradeProfit * 100).toFixed(1)}%)`);

  // Step 3: Fetch actual order books
  console.log('\n3. Fetching ACTUAL order books...\n');

  const polyBook = await fetchPolymarketOrderBook(polyTokenIds[0], polyTokenIds[1]);
  const kalshiBook = await fetchKalshiOrderBook(kalshiBarcelona.ticker);

  console.log('Polymarket Order Book:');
  console.log(`  YES Bids: ${polyBook.yesBids.length} levels`);
  console.log(`  YES Asks: ${polyBook.yesAsks.length} levels`);
  if (polyBook.yesAsks.length > 0) {
    console.log(`  Best YES Ask: ${(polyBook.yesAsks[0].price * 100).toFixed(1)}¢ (${polyBook.yesAsks[0].size.toFixed(0)} shares)`);
  }
  if (polyBook.yesBids.length > 0) {
    console.log(`  Best YES Bid: ${(polyBook.yesBids[0].price * 100).toFixed(1)}¢ (${polyBook.yesBids[0].size.toFixed(0)} shares)`);
  }

  console.log('\nKalshi Order Book:');
  console.log(`  YES Bids: ${kalshiBook.yesBids.length} levels`);
  console.log(`  YES Asks: ${kalshiBook.yesAsks.length} levels`);
  console.log(`  NO Bids: ${kalshiBook.noBids.length} levels`);
  console.log(`  NO Asks: ${kalshiBook.noAsks.length} levels`);
  if (kalshiBook.noAsks.length > 0) {
    console.log(`  Best NO Ask: ${(kalshiBook.noAsks[0].price * 100).toFixed(1)}¢ (${kalshiBook.noAsks[0].size.toFixed(0)} shares)`);
  }
  if (kalshiBook.noBids.length > 0) {
    console.log(`  Best NO Bid: ${(kalshiBook.noBids[0].price * 100).toFixed(1)}¢ (${kalshiBook.noBids[0].size.toFixed(0)} shares)`);
  }

  // Step 4: Calculate actual executable arbitrage
  console.log('\n4. Arbitrage based on ACTUAL order book prices:\n');

  if (polyBook.yesAsks.length > 0 && kalshiBook.noAsks.length > 0) {
    const bestPolyYesAsk = polyBook.yesAsks[0].price;
    const bestKalshiNoAsk = kalshiBook.noAsks[0].price;

    const actualCost = bestPolyYesAsk + bestKalshiNoAsk;
    const actualProfit = 1 - actualCost;

    console.log(`  Buy Poly YES @ ${(bestPolyYesAsk * 100).toFixed(1)}¢ (best ask)`);
    console.log(`  Buy Kalshi NO @ ${(bestKalshiNoAsk * 100).toFixed(1)}¢ (best ask)`);
    console.log(`  Total Cost: ${(actualCost * 100).toFixed(1)}¢`);
    console.log(`  Profit: ${(actualProfit * 100).toFixed(1)}¢ (${(actualProfit * 100).toFixed(1)}%)`);

    if (actualProfit <= 0) {
      console.log('\n  ⚠️  NO EXECUTABLE ARBITRAGE!');
      console.log('  The order book spread has closed since the last trade.');
      console.log('  The "spread" shown earlier was based on stale last-trade prices.');
    } else {
      console.log('\n  ✅ Executable arbitrage exists!');
    }
  } else {
    console.log('  Missing order book data');
  }

  // Step 5: Show the discrepancy
  console.log('\n5. Summary:\n');
  console.log(`  Last Trade Spread: ${(lastTradeProfit * 100).toFixed(1)}%`);
  if (polyBook.yesAsks.length > 0 && kalshiBook.noAsks.length > 0) {
    const actualProfit = 1 - (polyBook.yesAsks[0].price + kalshiBook.noAsks[0].price);
    console.log(`  Order Book Spread: ${(actualProfit * 100).toFixed(1)}%`);
    console.log(`  Difference: ${((lastTradeProfit - actualProfit) * 100).toFixed(1)}%`);
  }
}

main().catch(console.error);
