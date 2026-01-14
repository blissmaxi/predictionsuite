/**
 * Opportunity Processor
 *
 * Transforms scan results into API response format.
 */

import {
  runScan,
  getCachedResult,
  type ScanResult,
  type OpportunityWithLiquidity,
} from '../services/scanner.service.js';

// ============ API Response Types ============

export interface OpportunityDto {
  id: string;
  eventName: string;
  marketName: string;
  category: string;
  imageUrl: string | null;
  type: 'guaranteed' | 'spread';
  spreadPct: number;
  action: string;
  potentialProfit: number;
  maxInvestment: number;
  timeToResolution: string | null;
  fees: {
    polymarket: number;
    kalshi: number;
  };
  prices: {
    // Last traded prices (for reference)
    polymarket: { yes: number; no: number };
    kalshi: { yes: number; no: number };
    // Order book prices (actual executable prices) - null if not analyzed
    orderBook: {
      polyYesAsk: number;  // Best ask to buy Polymarket YES
      kalshiNoAsk: number; // Best ask to buy Kalshi NO
      totalCost: number;   // Cost to execute 1 contract
      profitPct: number;   // Actual profit % from order book
    } | null;
  };
  urls: {
    polymarket: string | null;
    kalshi: string | null;
  };
  liquidity: {
    status: 'available' | 'spread_closed' | 'no_liquidity' | 'not_analyzed';
    limitedBy: string | null;
  };
  roi: number | null;  // Return on investment (profit / investment * 100)
  apr: number | null;  // Annualized return based on time to resolution
  lastUpdated: string;
}

export interface OpportunitiesResponse {
  opportunities: OpportunityDto[];
  meta: {
    totalCount: number;
    scannedAt: string;
  };
}

// ============ Transform Functions ============

function generateOpportunityId(opp: OpportunityWithLiquidity): string {
  const { pair } = opp.opportunity;
  const entity = pair.matchedEntity.toLowerCase().replace(/\s+/g, '-');
  const event = (pair.eventName || 'unknown').toLowerCase().replace(/\s+/g, '-');
  return `${event}-${entity}`.slice(0, 64);
}

function getLiquidityStatus(
  opp: OpportunityWithLiquidity
): OpportunityDto['liquidity'] {
  if (!opp.liquidity) {
    return { status: 'not_analyzed', limitedBy: null };
  }

  const { limitedBy, maxProfit } = opp.liquidity;

  if (limitedBy === 'no_liquidity') {
    return { status: 'no_liquidity', limitedBy };
  }
  if (limitedBy === 'spread_closed') {
    return { status: 'spread_closed', limitedBy };
  }
  if (maxProfit > 0) {
    return { status: 'available', limitedBy };
  }

  return { status: 'no_liquidity', limitedBy };
}

function getPolymarketUrl(slug: string | undefined): string | null {
  if (!slug) return null;
  return `https://polymarket.com/event/${slug}`;
}

// Mapping of Kalshi series tickers to their URL slugs
const KALSHI_SERIES_SLUGS: Record<string, string> = {
  KXNBAGAME: 'professional-basketball-game',
  KXNBA: 'nba-championship',
  KXNFL: 'nfl-championship',
  KXMLB: 'mlb-championship',
  KXNHL: 'nhl-championship',
  KXUCL: 'champions-league',
  KXSUPERBOWL: 'super-bowl',
  INXD: 'dow-jones',
  INXN: 'nasdaq-100',
  INXS: 's-and-p-500',
  FED: 'fed-funds-rate',
  KXTEMP: 'temperature',
  HIGHNY: 'nyc-temperature',
};

function getKalshiUrl(
  ticker: string | undefined,
  seriesTicker: string | undefined
): string | null {
  if (!ticker || !seriesTicker) return null;

  const seriesLower = seriesTicker.toLowerCase();
  const slug = KALSHI_SERIES_SLUGS[seriesTicker] || seriesLower;

  // For individual market tickers (e.g., KXNBAGAME-26JAN14WASLAC-LAC),
  // extract the event ticker by removing the last segment (team code)
  // Event ticker format: KXNBAGAME-26JAN14WASLAC
  const tickerParts = ticker.split('-');
  let eventTicker = ticker;

  // If ticker has 3+ parts and looks like a game market (series-date-team),
  // remove the team suffix to get the event ticker
  if (tickerParts.length >= 3 && seriesTicker === 'KXNBAGAME') {
    eventTicker = tickerParts.slice(0, -1).join('-');
  }

  return `https://kalshi.com/markets/${seriesLower}/${slug}/${eventTicker.toLowerCase()}`;
}

function getEarliestEndDate(polyEndDate?: string, kalshiEndDate?: string): string | null {
  const dates: Date[] = [];

  if (polyEndDate) {
    const d = new Date(polyEndDate);
    if (!isNaN(d.getTime())) dates.push(d);
  }
  if (kalshiEndDate) {
    const d = new Date(kalshiEndDate);
    if (!isNaN(d.getTime())) dates.push(d);
  }

  if (dates.length === 0) return null;

  // Return the earliest date
  const earliest = dates.reduce((a, b) => (a < b ? a : b));
  return earliest.toISOString();
}

function transformOpportunity(
  opp: OpportunityWithLiquidity,
  scannedAt: Date
): OpportunityDto {
  const { opportunity, liquidity } = opp;
  const { pair, type, profitPct, action } = opportunity;

  // Build order book prices if liquidity analysis is available
  let orderBookPrices: OpportunityDto['prices']['orderBook'] = null;
  let actualSpreadPct = profitPct; // Default to last-traded-based spread

  if (liquidity?.bestPolyAsk !== undefined && liquidity?.bestKalshiAsk !== undefined) {
    const totalCost = liquidity.orderBookCost ?? (liquidity.bestPolyAsk + liquidity.bestKalshiAsk);
    const orderBookProfitPct = (1 - totalCost) * 100;

    orderBookPrices = {
      polyYesAsk: liquidity.bestPolyAsk,
      kalshiNoAsk: liquidity.bestKalshiAsk,
      totalCost,
      profitPct: orderBookProfitPct,
    };

    // Use order book spread as the primary spread indicator
    actualSpreadPct = orderBookProfitPct;
  }

  // Get earliest resolution date from either platform
  const timeToResolution = getEarliestEndDate(pair.polymarket.endDate, pair.kalshi.endDate);

  // Calculate ROI and APR
  const maxProfit = liquidity?.maxProfit ?? 0;
  const maxInvestment = liquidity?.maxInvestment ?? 0;
  const roi = maxInvestment > 0 ? (maxProfit / maxInvestment) * 100 : null;

  let apr: number | null = null;
  if (roi !== null && timeToResolution) {
    const now = Date.now();
    const resolutionTime = new Date(timeToResolution).getTime();
    const daysToResolution = (resolutionTime - now) / (1000 * 60 * 60 * 24);
    if (daysToResolution > 0) {
      apr = roi * (365 / daysToResolution);
    }
  }

  return {
    id: generateOpportunityId(opp),
    eventName: pair.eventName || 'Unknown Event',
    marketName: pair.matchedEntity,
    category: pair.category || 'other',
    imageUrl: pair.kalshi.imageUrl || null,
    type: type === 'guaranteed' ? 'guaranteed' : 'spread',
    spreadPct: actualSpreadPct,
    action: formatAction(action),
    potentialProfit: liquidity?.maxProfit ?? 0,
    maxInvestment: liquidity?.maxInvestment ?? 0,
    timeToResolution,
    fees: {
      polymarket: 2.0, // Estimate
      kalshi: 1.0, // Estimate
    },
    prices: {
      polymarket: {
        yes: pair.polymarket.yesPrice,
        no: pair.polymarket.noPrice,
      },
      kalshi: {
        yes: pair.kalshi.yesPrice,
        no: pair.kalshi.noPrice,
      },
      orderBook: orderBookPrices,
    },
    urls: {
      polymarket: getPolymarketUrl(pair.polymarket.slug),
      kalshi: getKalshiUrl(pair.kalshi.ticker, pair.kalshi.seriesTicker),
    },
    liquidity: getLiquidityStatus(opp),
    roi,
    apr,
    lastUpdated: scannedAt.toISOString(),
  };
}

function formatAction(action: string): string {
  // Simplify the action string for display
  // Original: "Buy Polymarket YES (50.0¢) + Kalshi NO (48.0¢) = 98.0¢ cost, $1 payout"
  // Simplified: "Buy YES on Polymarket + NO on Kalshi"
  if (action.includes('Polymarket YES') && action.includes('Kalshi NO')) {
    return 'Buy YES on Polymarket + NO on Kalshi';
  }
  if (action.includes('Kalshi YES') && action.includes('Polymarket NO')) {
    return 'Buy YES on Kalshi + NO on Polymarket';
  }
  if (action.includes('Buy Polymarket YES')) {
    return 'Buy YES on Polymarket, Sell on Kalshi';
  }
  if (action.includes('Buy Kalshi YES')) {
    return 'Buy YES on Kalshi, Sell on Polymarket';
  }
  return action;
}

// ============ Processor Functions ============

export async function getOpportunities(
  forceRefresh = false
): Promise<OpportunitiesResponse> {
  const result = forceRefresh ? await runScan(true) : await runScan();

  const opportunities = result.opportunities.map((opp) =>
    transformOpportunity(opp, result.scannedAt)
  );

  // Sort by spread percentage descending
  opportunities.sort((a, b) => b.spreadPct - a.spreadPct);

  return {
    opportunities,
    meta: {
      totalCount: opportunities.length,
      scannedAt: result.scannedAt.toISOString(),
    },
  };
}

export function getOpportunitiesCached(): OpportunitiesResponse | null {
  const result = getCachedResult();
  if (!result) return null;

  const opportunities = result.opportunities.map((opp) =>
    transformOpportunity(opp, result.scannedAt)
  );

  opportunities.sort((a, b) => b.spreadPct - a.spreadPct);

  return {
    opportunities,
    meta: {
      totalCount: opportunities.length,
      scannedAt: result.scannedAt.toISOString(),
    },
  };
}
