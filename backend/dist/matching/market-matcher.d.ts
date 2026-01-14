/**
 * Market Matcher
 *
 * Matches individual markets within matched events between
 * Polymarket and Kalshi platforms.
 */
export interface MarketData {
    question: string;
    yesPrice: number;
    noPrice?: number;
    volume?: number;
    tokenIds?: string[];
    ticker?: string;
    endDate?: string;
}
export interface MarketPair {
    polymarket: {
        question: string;
        yesPrice: number;
        noPrice: number;
        tokenIds?: string[];
        slug?: string;
        endDate?: string;
    };
    kalshi: {
        question: string;
        yesPrice: number;
        noPrice: number;
        ticker?: string;
        seriesTicker?: string;
        imageUrl?: string;
        endDate?: string;
    };
    eventName?: string;
    matchedEntity: string;
    category?: string;
    confidence: number;
    spread: number;
}
/**
 * Match markets within an event based on category.
 */
export declare function matchMarketsWithinEvent(polymarkets: MarketData[], kalshiMarkets: MarketData[], category: string, eventName?: string): MarketPair[];
