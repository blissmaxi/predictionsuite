/**
 * Market Matcher
 *
 * Matches individual markets within matched events between
 * Polymarket and Kalshi platforms.
 */

import { normalizeTeamName, detectLeague, type League } from './normalizers/sports.js';

// ============ Types ============

export interface MarketData {
  question: string;
  yesPrice: number;
  noPrice?: number;
  volume?: number;
  // Identifiers for order book fetching
  tokenIds?: string[];  // Polymarket: [yesTokenId, noTokenId]
  ticker?: string;      // Kalshi: market ticker
}

export interface MarketPair {
  polymarket: {
    question: string;
    yesPrice: number;
    noPrice: number;
    tokenIds?: string[];  // [yesTokenId, noTokenId]
  };
  kalshi: {
    question: string;
    yesPrice: number;
    noPrice: number;
    ticker?: string;
  };
  eventName?: string;     // e.g., "NHL Stanley Cup", "Super Bowl"
  matchedEntity: string;  // e.g., "washington capitals", "kansas city chiefs"
  confidence: number;
  spread: number;
}

// ============ Category Dispatching ============

/**
 * Match markets within an event based on category.
 */
export function matchMarketsWithinEvent(
  polymarkets: MarketData[],
  kalshiMarkets: MarketData[],
  category: string,
  eventName?: string
): MarketPair[] {
  switch (category) {
    case 'sports':
      return matchSportsMarkets(polymarkets, kalshiMarkets, eventName);
    case 'weather':
      return matchWeatherMarkets(polymarkets, kalshiMarkets, eventName);
    case 'finance':
      return matchFinanceMarkets(polymarkets, kalshiMarkets, eventName);
    default:
      return [];
  }
}

// ============ Sports Matching ============

function matchSportsMarkets(
  polymarkets: MarketData[],
  kalshiMarkets: MarketData[],
  eventName?: string
): MarketPair[] {
  const pairs: MarketPair[] = [];

  // Detect league from event name
  const league = eventName ? detectLeague(eventName) : null;
  if (!league) return pairs;

  // Build lookup map for Kalshi markets by team
  const kalshiByTeam = new Map<string, MarketData>();
  for (const market of kalshiMarkets) {
    const team = normalizeTeamName(market.question, league);
    if (team) {
      kalshiByTeam.set(team, market);
    }
  }

  // Match Polymarket markets to Kalshi
  for (const polyMarket of polymarkets) {
    const team = normalizeTeamName(polyMarket.question, league);
    if (!team) continue;

    const kalshiMarket = kalshiByTeam.get(team);
    if (!kalshiMarket) continue;

    const polyYes = polyMarket.yesPrice;
    const polyNo = polyMarket.noPrice ?? (1 - polyYes);
    const kalshiYes = kalshiMarket.yesPrice;
    const kalshiNo = kalshiMarket.noPrice ?? (1 - kalshiYes);

    pairs.push({
      polymarket: {
        question: polyMarket.question,
        yesPrice: polyYes,
        noPrice: polyNo,
        tokenIds: polyMarket.tokenIds,
      },
      kalshi: {
        question: kalshiMarket.question,
        yesPrice: kalshiYes,
        noPrice: kalshiNo,
        ticker: kalshiMarket.ticker,
      },
      eventName,
      matchedEntity: team,
      confidence: 1.0,
      spread: Math.abs(polyYes - kalshiYes),
    });
  }

  return pairs;
}

// ============ Weather Matching ============

interface TempRange {
  min?: number;
  max?: number;
  exact?: number;
}

function parseTemperatureRange(text: string): TempRange | null {
  const lower = text.toLowerCase();

  // "37°F or below" / "38° or below" / "37 or below"
  const belowMatch = lower.match(/(\d+)(?:°f?)?(?:\s*or)?\s*(?:below|under|less)/);
  if (belowMatch) {
    return { max: parseInt(belowMatch[1], 10) };
  }

  // "51°F or above" / "51° or above" / "51 or above"
  const aboveMatch = lower.match(/(\d+)(?:°f?)?(?:\s*or)?\s*(?:above|over|more|higher)/);
  if (aboveMatch) {
    return { min: parseInt(aboveMatch[1], 10) };
  }

  // "40-41°F" / "40° to 41°" / "40 to 41"
  const rangeMatch = lower.match(/(\d+)(?:°f?)?\s*(?:to|-)\s*(\d+)(?:°f?)?/);
  if (rangeMatch) {
    return {
      min: parseInt(rangeMatch[1], 10),
      max: parseInt(rangeMatch[2], 10),
    };
  }

  // Exact temperature "42°F" / "42°"
  const exactMatch = lower.match(/^(\d+)(?:°f?)?$/);
  if (exactMatch) {
    return { exact: parseInt(exactMatch[1], 10) };
  }

  return null;
}

function rangesMatch(a: TempRange, b: TempRange): boolean {
  // STRICT matching - ranges must be exactly equal
  // Polymarket and Kalshi use systematically different boundaries (1°F offset)
  // so approximate matching would create false "arbitrage" opportunities

  // Exact match for bounded ranges
  if (a.min !== undefined && a.max !== undefined &&
      b.min !== undefined && b.max !== undefined) {
    return a.min === b.min && a.max === b.max;
  }

  // Below threshold - must be exactly equal
  if (a.max !== undefined && a.min === undefined &&
      b.max !== undefined && b.min === undefined) {
    return a.max === b.max;
  }

  // Above threshold - must be exactly equal
  if (a.min !== undefined && a.max === undefined &&
      b.min !== undefined && b.max === undefined) {
    return a.min === b.min;
  }

  return false;
}

function matchWeatherMarkets(
  polymarkets: MarketData[],
  kalshiMarkets: MarketData[],
  eventName?: string
): MarketPair[] {
  const pairs: MarketPair[] = [];

  // Parse all ranges
  const polyRanges = polymarkets.map(m => ({
    market: m,
    range: parseTemperatureRange(m.question),
  })).filter(r => r.range !== null);

  const kalshiRanges = kalshiMarkets.map(m => ({
    market: m,
    range: parseTemperatureRange(m.question),
  })).filter(r => r.range !== null);

  // Match ranges
  for (const poly of polyRanges) {
    for (const kalshi of kalshiRanges) {
      if (rangesMatch(poly.range!, kalshi.range!)) {
        const polyYes = poly.market.yesPrice;
        const polyNo = poly.market.noPrice ?? (1 - polyYes);
        const kalshiYes = kalshi.market.yesPrice;
        const kalshiNo = kalshi.market.noPrice ?? (1 - kalshiYes);

        const rangeStr = formatRange(poly.range!);

        pairs.push({
          polymarket: {
            question: poly.market.question,
            yesPrice: polyYes,
            noPrice: polyNo,
            tokenIds: poly.market.tokenIds,
          },
          kalshi: {
            question: kalshi.market.question,
            yesPrice: kalshiYes,
            noPrice: kalshiNo,
            ticker: kalshi.market.ticker,
          },
          eventName,
          matchedEntity: rangeStr,
          confidence: 0.9, // Slightly lower due to potential 1°F difference
          spread: Math.abs(polyYes - kalshiYes),
        });
        break; // One match per poly market
      }
    }
  }

  return pairs;
}

function formatRange(range: TempRange): string {
  if (range.exact !== undefined) {
    return `${range.exact}°F`;
  }
  if (range.min !== undefined && range.max !== undefined) {
    return `${range.min}-${range.max}°F`;
  }
  if (range.max !== undefined) {
    return `≤${range.max}°F`;
  }
  if (range.min !== undefined) {
    return `≥${range.min}°F`;
  }
  return 'unknown';
}

// ============ Finance Matching ============

interface FedAction {
  type: 'cut' | 'raise' | 'hold';
  bps?: number;
}

function parseFedAction(text: string): FedAction | null {
  const lower = text.toLowerCase();

  // "Hold" / "No change" / "Unchanged"
  if (/\b(hold|no change|unchanged|maintain)\b/.test(lower)) {
    return { type: 'hold' };
  }

  // "Cut 25 bps" / "25bp cut" / "-25bps"
  const cutMatch = lower.match(/(?:cut|lower|decrease|reduce|-).*?(\d+)\s*(?:bp|bps|basis)/i) ||
                   lower.match(/(\d+)\s*(?:bp|bps|basis).*?(?:cut|lower|decrease|reduce)/i);
  if (cutMatch) {
    return { type: 'cut', bps: parseInt(cutMatch[1], 10) };
  }

  // "Raise 25 bps" / "25bp hike" / "+25bps"
  const raiseMatch = lower.match(/(?:raise|hike|increase|\+).*?(\d+)\s*(?:bp|bps|basis)/i) ||
                     lower.match(/(\d+)\s*(?:bp|bps|basis).*?(?:raise|hike|increase)/i);
  if (raiseMatch) {
    return { type: 'raise', bps: parseInt(raiseMatch[1], 10) };
  }

  return null;
}

function fedActionsMatch(a: FedAction, b: FedAction): boolean {
  if (a.type !== b.type) return false;
  if (a.bps !== undefined && b.bps !== undefined) {
    return a.bps === b.bps;
  }
  return a.bps === undefined && b.bps === undefined;
}

function matchFinanceMarkets(
  polymarkets: MarketData[],
  kalshiMarkets: MarketData[],
  eventName?: string
): MarketPair[] {
  const pairs: MarketPair[] = [];

  const polyActions = polymarkets.map(m => ({
    market: m,
    action: parseFedAction(m.question),
  })).filter(a => a.action !== null);

  const kalshiActions = kalshiMarkets.map(m => ({
    market: m,
    action: parseFedAction(m.question),
  })).filter(a => a.action !== null);

  for (const poly of polyActions) {
    for (const kalshi of kalshiActions) {
      if (fedActionsMatch(poly.action!, kalshi.action!)) {
        const polyYes = poly.market.yesPrice;
        const polyNo = poly.market.noPrice ?? (1 - polyYes);
        const kalshiYes = kalshi.market.yesPrice;
        const kalshiNo = kalshi.market.noPrice ?? (1 - kalshiYes);

        const actionStr = formatFedAction(poly.action!);

        pairs.push({
          polymarket: {
            question: poly.market.question,
            yesPrice: polyYes,
            noPrice: polyNo,
            tokenIds: poly.market.tokenIds,
          },
          kalshi: {
            question: kalshi.market.question,
            yesPrice: kalshiYes,
            noPrice: kalshiNo,
            ticker: kalshi.market.ticker,
          },
          eventName,
          matchedEntity: actionStr,
          confidence: 1.0,
          spread: Math.abs(polyYes - kalshiYes),
        });
        break;
      }
    }
  }

  return pairs;
}

function formatFedAction(action: FedAction): string {
  if (action.type === 'hold') return 'Hold';
  const direction = action.type === 'cut' ? 'Cut' : 'Raise';
  return action.bps ? `${direction} ${action.bps}bps` : direction;
}
