/**
 * Arbitrage Calculator
 *
 * Calculates arbitrage opportunities between matched market pairs.
 */

import type { MarketPair } from '../matching/market-matcher.js';

// ============ Types ============

export interface ArbitrageOpportunity {
  pair: MarketPair;
  type: 'simple' | 'guaranteed';
  profitPct: number;
  action: string;
  guaranteedProfit?: number;
}

// ============ Configuration ============

const MIN_SPREAD_PCT = 2.0; // Minimum spread to report (2%)

// ============ Calculator ============

/**
 * Calculate arbitrage opportunity for a market pair.
 *
 * @param pair The matched market pair
 * @returns ArbitrageOpportunity if spread is significant, null otherwise
 */
export function calculateArbitrage(pair: MarketPair): ArbitrageOpportunity | null {
  const polyYes = pair.polymarket.yesPrice;
  const polyNo = pair.polymarket.noPrice;
  const kalshiYes = pair.kalshi.yesPrice;
  const kalshiNo = pair.kalshi.noPrice;

  // Skip pairs where either platform has no price (market not yet listed)
  if (polyYes <= 0 || kalshiYes <= 0) {
    return null;
  }

  // Check for guaranteed arbitrage (rare but possible)
  // Buy YES on one platform + NO on other < $1 = guaranteed profit

  // Strategy 1: Buy Polymarket YES + Buy Kalshi NO
  const cost1 = polyYes + kalshiNo;
  // Strategy 2: Buy Kalshi YES + Buy Polymarket NO
  const cost2 = kalshiYes + polyNo;

  if (cost1 < 1) {
    const profit = 1 - cost1;
    return {
      pair,
      type: 'guaranteed',
      profitPct: profit * 100,
      guaranteedProfit: profit,
      action: `Buy Polymarket YES (${formatPrice(polyYes)}) + Kalshi NO (${formatPrice(kalshiNo)}) = ${formatPrice(cost1)} cost, $1 payout`,
    };
  }

  if (cost2 < 1) {
    const profit = 1 - cost2;
    return {
      pair,
      type: 'guaranteed',
      profitPct: profit * 100,
      guaranteedProfit: profit,
      action: `Buy Kalshi YES (${formatPrice(kalshiYes)}) + Polymarket NO (${formatPrice(polyNo)}) = ${formatPrice(cost2)} cost, $1 payout`,
    };
  }

  // Simple spread arbitrage (directional bet)
  const spread = Math.abs(polyYes - kalshiYes);
  const spreadPct = spread * 100;

  if (spreadPct < MIN_SPREAD_PCT) {
    return null;
  }

  // Determine direction
  let action: string;
  if (polyYes < kalshiYes) {
    // Polymarket is cheaper for YES
    action = `Buy Polymarket YES (${formatPrice(polyYes)}), Sell Kalshi YES (${formatPrice(kalshiYes)})`;
  } else {
    // Kalshi is cheaper for YES
    action = `Buy Kalshi YES (${formatPrice(kalshiYes)}), Sell Polymarket YES (${formatPrice(polyYes)})`;
  }

  return {
    pair,
    type: 'simple',
    profitPct: spreadPct,
    action,
  };
}

/**
 * Calculate all arbitrage opportunities from a list of market pairs.
 *
 * @param pairs List of matched market pairs
 * @returns Array of arbitrage opportunities sorted by profit potential
 */
export function findArbitrageOpportunities(pairs: MarketPair[]): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const pair of pairs) {
    const arb = calculateArbitrage(pair);
    if (arb) {
      opportunities.push(arb);
    }
  }

  // Sort by profit potential (guaranteed first, then by percentage)
  opportunities.sort((a, b) => {
    // Guaranteed arbs always come first
    if (a.type === 'guaranteed' && b.type !== 'guaranteed') return -1;
    if (b.type === 'guaranteed' && a.type !== 'guaranteed') return 1;

    // Then sort by profit percentage (descending)
    return b.profitPct - a.profitPct;
  });

  return opportunities;
}

/**
 * Create opportunities for ALL market pairs, including those without significant spreads.
 * This is used to display all matched markets in the frontend.
 *
 * @param pairs List of matched market pairs
 * @returns Array of all opportunities (with or without arbitrage potential)
 */
export function createOpportunitiesFromAllPairs(pairs: MarketPair[]): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const pair of pairs) {
    const polyYes = pair.polymarket.yesPrice;
    const polyNo = pair.polymarket.noPrice;
    const kalshiYes = pair.kalshi.yesPrice;
    const kalshiNo = pair.kalshi.noPrice;

    // Skip pairs where either platform has no price (market not yet listed)
    if (polyYes <= 0 || kalshiYes <= 0) {
      continue;
    }

    // Check for guaranteed arbitrage
    const cost1 = polyYes + kalshiNo;
    const cost2 = kalshiYes + polyNo;

    if (cost1 < 1) {
      const profit = 1 - cost1;
      opportunities.push({
        pair,
        type: 'guaranteed',
        profitPct: profit * 100,
        guaranteedProfit: profit,
        action: `Buy Polymarket YES (${formatPrice(polyYes)}) + Kalshi NO (${formatPrice(kalshiNo)}) = ${formatPrice(cost1)} cost, $1 payout`,
      });
    } else if (cost2 < 1) {
      const profit = 1 - cost2;
      opportunities.push({
        pair,
        type: 'guaranteed',
        profitPct: profit * 100,
        guaranteedProfit: profit,
        action: `Buy Kalshi YES (${formatPrice(kalshiYes)}) + Polymarket NO (${formatPrice(polyNo)}) = ${formatPrice(cost2)} cost, $1 payout`,
      });
    } else {
      // No arbitrage, but still include for display
      const spread = Math.abs(polyYes - kalshiYes);
      const spreadPct = spread * 100;

      let action: string;
      if (polyYes < kalshiYes) {
        action = `Buy Polymarket YES (${formatPrice(polyYes)}), Sell Kalshi YES (${formatPrice(kalshiYes)})`;
      } else {
        action = `Buy Kalshi YES (${formatPrice(kalshiYes)}), Sell Polymarket YES (${formatPrice(polyYes)})`;
      }

      opportunities.push({
        pair,
        type: 'simple',
        profitPct: spreadPct,
        action,
      });
    }
  }

  // Sort by profit potential (guaranteed first, then by percentage)
  opportunities.sort((a, b) => {
    if (a.type === 'guaranteed' && b.type !== 'guaranteed') return -1;
    if (b.type === 'guaranteed' && a.type !== 'guaranteed') return 1;
    return b.profitPct - a.profitPct;
  });

  return opportunities;
}

/**
 * Summarize arbitrage opportunities.
 */
export function summarizeOpportunities(opportunities: ArbitrageOpportunity[]): {
  total: number;
  guaranteed: number;
  simple: number;
  avgSpreadPct: number;
  maxSpreadPct: number;
} {
  const guaranteed = opportunities.filter(o => o.type === 'guaranteed').length;
  const simple = opportunities.filter(o => o.type === 'simple').length;

  const spreads = opportunities.map(o => o.profitPct);
  const avgSpreadPct = spreads.length > 0
    ? spreads.reduce((a, b) => a + b, 0) / spreads.length
    : 0;
  const maxSpreadPct = spreads.length > 0 ? Math.max(...spreads) : 0;

  return {
    total: opportunities.length,
    guaranteed,
    simple,
    avgSpreadPct,
    maxSpreadPct,
  };
}

// ============ Helpers ============

function formatPrice(price: number): string {
  return (price * 100).toFixed(1) + '¢';
}
