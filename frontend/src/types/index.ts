/**
 * Shared types for the frontend
 */

export interface Opportunity {
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
    polymarket: { yes: number; no: number };
    kalshi: { yes: number; no: number };
    orderBook: { polyYesAsk: number; kalshiNoAsk: number; kalshiYesAsk: number; polyNoAsk: number } | null;
  };
  urls: {
    polymarket: string | null;
    kalshi: string | null;
  };
  liquidity: {
    status: 'available' | 'spread_closed' | 'no_liquidity' | 'not_analyzed';
    limitedBy: string | null;
  };
  roi: number | null;
  apr: number | null;
  lastUpdated: string;
}

export interface OpportunitiesResponse {
  opportunities: Opportunity[];
  meta: {
    totalCount: number;
    scannedAt: string;
  };
}
