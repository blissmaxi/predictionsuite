/**
 * Opportunity Processor
 *
 * Transforms scan results into API response format.
 */
export interface OpportunityDto {
    id: string;
    eventName: string;
    marketName: string;
    category: string;
    imageUrl: string | null;
    type: 'guaranteed' | 'spread';
    spreadPct: number;
    potentialProfit: number;
    maxInvestment: number;
    timeToResolution: string | null;
    fees: {
        polymarket: number;
        kalshi: number;
    };
    prices: {
        polymarket: {
            yes: number;
            no: number;
        };
        kalshi: {
            yes: number;
            no: number;
        };
    };
    liquidity: {
        status: 'available' | 'spread_closed' | 'no_liquidity' | 'not_analyzed';
        limitedBy: string | null;
    };
    lastUpdated: string;
}
export interface OpportunitiesResponse {
    opportunities: OpportunityDto[];
    meta: {
        totalCount: number;
        scannedAt: string;
    };
}
export declare function getOpportunities(forceRefresh?: boolean): Promise<OpportunitiesResponse>;
export declare function getOpportunitiesCached(): OpportunitiesResponse | null;
