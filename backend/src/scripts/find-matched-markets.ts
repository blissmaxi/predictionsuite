/**
 * Find Matched Markets
 *
 * Main arbitrage scanner CLI that:
 * 1. Uses the shared scanner service to fetch and match markets
 * 2. Displays results with detailed formatting
 * 3. Analyzes liquidity for top opportunities
 *
 * This script is a CLI wrapper around the scanner service.
 * All market fetching, matching, and arbitrage logic is in scanner.service.ts
 */

import {
  runScan,
  type ScanResult,
  type MatchedEvent,
  type OpportunityWithLiquidity,
} from '../api/services/scanner.service.js';
import {
  findArbitrageOpportunities,
  summarizeOpportunities,
  type ArbitrageOpportunity,
} from '../arbitrage/calculator.js';
import {
  summarizeLiquidity,
  type LiquidityAnalysis,
} from '../arbitrage/liquidity-analyzer.js';
import { DISPLAY } from '../config/api.js';

// ============ Formatting Helpers ============

function formatPrice(price: number): string {
  return `${(price * 100).toFixed(1)}¢`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function printSeparator(char: '═' | '─' = '─'): void {
  console.log(char.repeat(DISPLAY.SEPARATOR_WIDTH));
}

function printHeader(title: string): void {
  printSeparator('═');
  console.log(title);
  printSeparator('═');
  console.log('');
}

function printSubheader(title: string): void {
  printSeparator('─');
  console.log(title);
  printSeparator('─');
  console.log('');
}

// ============ Results Display ============

function displayMatchedEvents(events: MatchedEvent[]): void {
  printHeader('Results: Events Found on BOTH Platforms');

  const bothPlatforms = events.filter((e) => e.polymarket.found && e.kalshi.found);

  if (bothPlatforms.length === 0) {
    console.log('No events found on both platforms.');
    return;
  }

  for (const event of bothPlatforms) {
    displaySingleEvent(event);
  }
}

function displaySingleEvent(event: MatchedEvent): void {
  const dateStr = event.date ? ` - ${formatDate(event.date)}` : '';
  console.log(`${event.name}${dateStr}`);
  console.log(`  Type: ${event.type} | Category: ${event.category}`);
  console.log('');

  // Polymarket markets
  console.log(`  Polymarket: ${event.polymarketSlug}`);
  if (event.polymarket.markets) {
    displayMarketPreview(event.polymarket.markets);
  }
  console.log('');

  // Kalshi markets
  console.log(`  Kalshi: ${event.kalshiTicker}`);
  if (event.kalshi.markets) {
    displayMarketPreview(event.kalshi.markets);
  }

  console.log('');
  printSeparator('─');
  console.log('');
}

function displayMarketPreview(markets: { question: string; yesPrice: number }[]): void {
  const preview = markets.slice(0, DISPLAY.PREVIEW_LIMIT);
  for (const m of preview) {
    const question = m.question.slice(0, 50);
    console.log(`    • ${question}: ${formatPrice(m.yesPrice)}`);
  }
  if (markets.length > DISPLAY.PREVIEW_LIMIT) {
    console.log(`    ... and ${markets.length - DISPLAY.PREVIEW_LIMIT} more`);
  }
}

// ============ Arbitrage Display ============

function displayArbitrageOpportunities(opportunities: OpportunityWithLiquidity[]): void {
  printHeader('Arbitrage Opportunities (with Liquidity Analysis)');

  if (opportunities.length === 0) {
    console.log('No significant arbitrage opportunities found (>2% spread).');
    return;
  }

  const withLiquidity = opportunities.filter((o) => o.liquidity !== null);
  const withoutLiquidity = opportunities.filter((o) => o.liquidity === null);

  // Display opportunities with liquidity analysis
  for (const opp of withLiquidity) {
    displayOpportunityWithLiquidity(opp);
  }

  // Mention opportunities without liquidity analysis
  if (withoutLiquidity.length > 0) {
    console.log(`... and ${withoutLiquidity.length} more opportunities (not analyzed for liquidity)`);
    console.log('');
  }

  // Display liquidity summary
  const analyses = withLiquidity
    .map((o) => o.liquidity)
    .filter((l): l is LiquidityAnalysis => l !== null);
  if (analyses.length > 0) {
    displayLiquiditySummary(analyses);
  }
}

function displayOpportunityWithLiquidity(opp: OpportunityWithLiquidity): void {
  const { opportunity, liquidity } = opp;
  const eventInfo = opportunity.pair.eventName ? ` [${opportunity.pair.eventName}]` : '';
  const marketName = `${opportunity.pair.matchedEntity}${eventInfo}`;

  // Calculate arbitrage strategy costs
  const polyYes = opportunity.pair.polymarket.yesPrice;
  const kalshiYes = opportunity.pair.kalshi.yesPrice;
  const kalshiNo = opportunity.pair.kalshi.noPrice;
  const polyNo = opportunity.pair.polymarket.noPrice;

  // Strategy: Buy Poly YES + Kalshi NO (bet on outcome happening)
  const costPolyYesKalshiNo = polyYes + kalshiNo;
  // Alternative: Buy Kalshi YES + Poly NO (bet on outcome NOT happening)
  const costKalshiYesPolyNo = kalshiYes + polyNo;

  const entity = opportunity.pair.matchedEntity;

  if (!liquidity) {
    console.log(`⚠️  NO DATA - ${marketName}`);
    console.log(`  Spread: ${opportunity.profitPct.toFixed(1)}%`);
    console.log(`  "${entity}" wins: Poly ${formatPrice(polyYes)} + Kalshi NO ${formatPrice(kalshiNo)} = ${formatPrice(costPolyYesKalshiNo)}`);
    console.log(`  "${entity}" loses: Kalshi ${formatPrice(kalshiYes)} + Poly NO ${formatPrice(polyNo)} = ${formatPrice(costKalshiYesPolyNo)}`);
    console.log('  Cannot analyze: Missing liquidity data');
    console.log('');
    return;
  }

  const label = getOpportunityLabel(liquidity);
  console.log(`${label} - ${marketName}`);
  console.log(`  Spread: ${opportunity.profitPct.toFixed(1)}%`);
  console.log(`  "${entity}" wins: Poly ${formatPrice(polyYes)} + Kalshi NO ${formatPrice(kalshiNo)} = ${formatPrice(costPolyYesKalshiNo)}`);
  console.log(`  "${entity}" loses: Kalshi ${formatPrice(kalshiYes)} + Poly NO ${formatPrice(polyNo)} = ${formatPrice(costKalshiYesPolyNo)}`);
  console.log(`  Max Contracts: ${liquidity.maxContracts.toFixed(2)}`);
  console.log(`  Max Investment: $${liquidity.maxInvestment.toFixed(2)}`);
  console.log(`  Max Profit: $${liquidity.maxProfit.toFixed(2)} (${liquidity.avgProfitPct.toFixed(2)}%)`);
  console.log(`  Limited by: ${formatLimitedBy(liquidity.limitedBy)}`);

  // Show price levels
  if (liquidity.levels.length > 0) {
    console.log('');
    console.log(`  Price Levels: ${liquidity.levels.length} levels (showing first 3)`);
    for (const level of liquidity.levels.slice(0, 3)) {
      const profitPct = level.profitPerContract / level.costPerContract * 100;
      console.log(`    ${level.contracts.toFixed(1)} @ Poly ${formatPrice(level.polyPrice)} + Kalshi ${formatPrice(level.kalshiPrice)} = ${profitPct.toFixed(1)}% profit`);
    }
  }

  console.log('');
}

function getOpportunityLabel(analysis: LiquidityAnalysis): string {
  const { limitedBy, maxProfit } = analysis;

  if (limitedBy === 'no_liquidity') {
    return '❌ NO LIQUIDITY';
  }
  if (limitedBy === 'spread_closed') {
    return '📉 SPREAD CLOSED';
  }

  if (maxProfit >= 100) {
    return '🔥 GUARANTEED ($100+)';
  }
  if (maxProfit >= 10) {
    return '✅ GUARANTEED ($10+)';
  }
  return '✓  Guaranteed';
}

function formatLimitedBy(limitedBy: string): string {
  switch (limitedBy) {
    case 'polymarket':
      return 'Polymarket liquidity';
    case 'kalshi':
      return 'Kalshi liquidity';
    case 'spread_closed':
      return 'Spread exhausted (prices converged)';
    case 'no_liquidity':
      return 'No executable liquidity';
    default:
      return limitedBy;
  }
}

function displayLiquiditySummary(analyses: LiquidityAnalysis[]): void {
  const summary = summarizeLiquidity(analyses);

  printSeparator('─');
  console.log(`Liquidity Summary`);
  printSeparator('─');
  console.log(`  Opportunities with liquidity: ${summary.withLiquidity}/${summary.totalOpportunities}`);
  console.log(`  Total deployable capital: $${summary.totalDeployableCapital.toFixed(2)}`);
  console.log(`  Total potential profit: $${summary.totalPotentialProfit.toFixed(2)}`);
  if (summary.totalDeployableCapital > 0) {
    console.log(`  Average profit: ${summary.avgProfitPct.toFixed(2)}%`);
  }
  console.log(`  Opportunities >$100: ${summary.over100}`);
  console.log(`  Opportunities >$1000: ${summary.over1000}`);
  console.log('');
}

// ============ Final Summary ============

function displayFinalSummary(result: ScanResult): void {
  const { events, opportunities } = result;
  const allMarketPairs = events
    .filter((e) => e.polymarket.found && e.kalshi.found)
    .flatMap((e) => e.marketPairs || []);

  const arbOpportunities = findArbitrageOpportunities(allMarketPairs);
  const arbSummary = summarizeOpportunities(arbOpportunities);

  const bothPlatforms = events.filter((e) => e.polymarket.found && e.kalshi.found);

  printHeader('Summary');
  console.log(`Total events checked: ${events.length}`);
  console.log(`Found on both platforms: ${bothPlatforms.length}`);
  console.log(`Polymarket only: ${events.filter((e) => e.polymarket.found && !e.kalshi.found).length}`);
  console.log(`Kalshi only: ${events.filter((e) => !e.polymarket.found && e.kalshi.found).length}`);
  console.log(`Not found: ${events.filter((e) => !e.polymarket.found && !e.kalshi.found).length}`);
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

// ============ Main ============

async function main(): Promise<void> {
  printHeader('PolyOracle Arbitrage Scanner');

  console.log('Running full scan (this may take 30-60 seconds)...');
  console.log('');

  // Use the shared scanner service
  const result = await runScan(true); // Force refresh

  console.log(`Scan complete at ${result.scannedAt.toLocaleTimeString()}`);
  console.log(`Found ${result.events.length} events, ${result.opportunities.length} opportunities`);
  console.log('');

  // Display events found on both platforms
  displayMatchedEvents(result.events);

  // Display arbitrage opportunities with liquidity analysis
  displayArbitrageOpportunities(result.opportunities);

  // Display final summary
  displayFinalSummary(result);
}

main().catch(console.error);
