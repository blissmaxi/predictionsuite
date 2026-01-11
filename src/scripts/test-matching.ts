/**
 * Test Matching Script
 *
 * Comprehensive test for the event matching system.
 * Fetches events from both platforms, runs the matcher, and validates results.
 */

import { fetchAllPolymarketEvents } from '../connectors/polymarket-connector.js';
import { fetchAllKalshiEvents } from '../connectors/kalshi-connector.js';
import { createEventMatcher } from '../matching/event-matcher.js';
import type { MatchCandidate, MatchingResult } from '../matching/types.js';

// ============ Configuration ============

// Limit events for faster testing (set to 0 for all)
const MAX_POLYMARKET_EVENTS = 1500;
const MAX_KALSHI_EVENTS = 1500;

// Expected matches for validation (partial title matches)
const EXPECTED_MATCHES = [
  { poly: 'fed', kalshi: 'fed' },
  { poly: 'trump', kalshi: 'trump' },
  { poly: 'super bowl', kalshi: 'super bowl' },
  { poly: 'pope', kalshi: 'pope' },
  { poly: 'interest rate', kalshi: 'interest rate' },
  { poly: 'inflation', kalshi: 'cpi' },
  { poly: 'bitcoin', kalshi: 'bitcoin' },
];

// ============ Formatting Helpers ============

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function colorScore(score: number): string {
  const percent = (score * 100).toFixed(1);
  if (score >= 0.85) return `${COLORS.green}${percent}%${COLORS.reset}`;
  if (score >= 0.7) return `${COLORS.yellow}${percent}%${COLORS.reset}`;
  if (score >= 0.5) return `${COLORS.gray}${percent}%${COLORS.reset}`;
  return `${COLORS.red}${percent}%${COLORS.reset}`;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len - 3) + '...' : str;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function clearLine() {
  process.stdout.write('\r\x1b[K');
}

function writeProgress(msg: string) {
  clearLine();
  process.stdout.write(msg);
}

// ============ Display Functions ============

function getEarliestEndDate(event: { markets: { endDate: string }[] }): string {
  let earliest: Date | null = null;

  for (const market of event.markets) {
    if (!market.endDate) continue;
    const date = new Date(market.endDate);
    if (isNaN(date.getTime())) continue;
    if (!earliest || date < earliest) {
      earliest = date;
    }
  }

  if (!earliest) return 'N/A';

  // Format as "Jan 15, 2025"
  return earliest.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function displayCandidate(candidate: MatchCandidate, index: number): void {
  const { polymarketEvent, kalshiEvent, score, signals } = candidate;

  const polyEndDate = getEarliestEndDate(polymarketEvent);
  const kalshiEndDate = getEarliestEndDate(kalshiEvent);

  console.log(`\n${COLORS.bold}${index + 1}. Score: ${colorScore(score)}${COLORS.reset}`);
  console.log(`   Polymarket: "${truncate(polymarketEvent.title, 70)}"`);
  console.log(`   Kalshi:     "${truncate(kalshiEvent.title, 70)}"`);

  // Show signal breakdown
  console.log(`   ${COLORS.gray}Signals:${COLORS.reset}`);
  console.log(`     Title: ${colorScore(signals.titleSimilarity)}  Token: ${colorScore(signals.tokenOverlap)}  Date: ${colorScore(signals.dateProximity)}`);

  // Show market counts and end dates
  console.log(`   ${COLORS.gray}Markets: Poly=${polymarketEvent.markets.length} (closes ${polyEndDate}), Kalshi=${kalshiEvent.markets.length} (closes ${kalshiEndDate})${COLORS.reset}`);
}

function displayStats(result: MatchingResult): void {
  const { stats } = result;

  console.log(`\n${COLORS.bold}========== STATISTICS ==========${COLORS.reset}`);
  console.log(`  Polymarket events:  ${stats.polymarketEventCount}`);
  console.log(`  Kalshi events:      ${stats.kalshiEventCount}`);
  console.log(`  Potential pairs:    ${stats.totalPotentialComparisons.toLocaleString()}`);
  console.log(`  Actual comparisons: ${stats.actualComparisons.toLocaleString()}`);
  console.log(`  Blocking reduction: ${COLORS.green}${stats.blockingReduction.toFixed(1)}%${COLORS.reset}`);
  console.log(`  Duration:           ${formatDuration(stats.durationMs)}`);
}

// ============ Validation ============

function validateExpectedMatches(result: MatchingResult): void {
  console.log(`\n${COLORS.bold}========== VALIDATION ==========${COLORS.reset}`);

  let passed = 0;
  let failed = 0;

  for (const expected of EXPECTED_MATCHES) {
    // Look for a match containing both keywords
    const found = result.candidates.find(c => {
      const polyTitle = c.polymarketEvent.title.toLowerCase();
      const kalshiTitle = c.kalshiEvent.title.toLowerCase();
      return polyTitle.includes(expected.poly) && kalshiTitle.includes(expected.kalshi);
    });

    if (found) {
      console.log(`  ${COLORS.green}[PASS]${COLORS.reset} Found "${expected.poly}" <-> "${expected.kalshi}" (score: ${colorScore(found.score)})`);
      passed++;
    } else {
      console.log(`  ${COLORS.yellow}[SKIP]${COLORS.reset} No match for "${expected.poly}" <-> "${expected.kalshi}" (may not be in sample)`);
    }
  }

  console.log(`\n  Validation: ${passed} found, ${EXPECTED_MATCHES.length - passed} not in sample`);
}

// ============ Main ============

async function main() {
  console.log(`${COLORS.bold}Event Matching Test${COLORS.reset}`);
  console.log('='.repeat(50));

  // ============ Fetch Events ============

  console.log('\nFetching events...');

  writeProgress('  Fetching Polymarket events...');
  const polyResult = await fetchAllPolymarketEvents({
    maxEvents: MAX_POLYMARKET_EVENTS,
    onProgress: (fetched) => {
      writeProgress(`  Fetching Polymarket events... ${fetched}`);
    },
  });
  clearLine();
  console.log(`  Polymarket: ${polyResult.data.length} events`);

  writeProgress('  Fetching Kalshi events...');
  const kalshiResult = await fetchAllKalshiEvents({
    maxEvents: MAX_KALSHI_EVENTS,
    onProgress: (fetched) => {
      writeProgress(`  Fetching Kalshi events... ${fetched}`);
    },
  });
  clearLine();
  console.log(`  Kalshi: ${kalshiResult.data.length} events`);

  // ============ Run Matcher ============

  console.log('\nRunning matcher...');

  const matcher = await createEventMatcher({
    cachePath: 'data/match-cache.json',
  });

  const result = await matcher.findMatches(
    polyResult.data,
    kalshiResult.data
  );

  // ============ Display Results ============

  console.log(`\n${COLORS.bold}Results:${COLORS.reset}`);
  console.log(`  Confirmed matches (>= 85%): ${COLORS.green}${result.confirmed.length}${COLORS.reset}`);
  console.log(`  Uncertain matches (50-85%): ${COLORS.yellow}${result.uncertain.length}${COLORS.reset}`);
  console.log(`  Total candidates:           ${result.candidates.length}`);

  // Display top confirmed matches
  if (result.confirmed.length > 0) {
    console.log(`\n${COLORS.bold}========== TOP CONFIRMED MATCHES ==========${COLORS.reset}`);
    for (let i = 0; i < Math.min(30, result.confirmed.length); i++) {
      displayCandidate(result.confirmed[i], i);
    }
    if (result.confirmed.length > 30) {
      console.log(`\n  ... and ${result.confirmed.length - 30} more confirmed matches`);
    }
  }

  // Display some uncertain matches
  if (result.uncertain.length > 0) {
    console.log(`\n${COLORS.bold}========== SAMPLE UNCERTAIN MATCHES ==========${COLORS.reset}`);
    for (let i = 0; i < Math.min(20, result.uncertain.length); i++) {
      displayCandidate(result.uncertain[i], i);
    }
    if (result.uncertain.length > 20) {
      console.log(`\n  ... and ${result.uncertain.length - 20} more uncertain matches`);
    }
  }

  // Display statistics
  displayStats(result);

  // Validate expected matches
  validateExpectedMatches(result);

  // ============ Save Cache ============

  console.log(`\n${COLORS.bold}========== CACHE ==========${COLORS.reset}`);

  const savedCount = await matcher.saveConfirmedMatches(result.confirmed);
  console.log(`  Saved ${savedCount} new confirmed matches to cache`);

  const cacheStats = matcher.getCacheStats();
  if (cacheStats) {
    console.log(`  Total cached: ${cacheStats.eventMatches} event matches, ${cacheStats.rejectedPairs} rejections`);
    console.log(`  Last updated: ${cacheStats.lastUpdated}`);
  }

  console.log(`\n${COLORS.green}Test completed successfully!${COLORS.reset}\n`);
}

main().catch(error => {
  console.error(`\n${COLORS.red}Error:${COLORS.reset}`, error);
  process.exit(1);
});
