/**
 * Catalog Matcher
 *
 * Reads market mappings from config/market-mappings.json and provides
 * functions to match markets between Polymarket and Kalshi.
 */
export interface StaticMapping {
    name: string;
    category: string;
    polymarket: string;
    kalshi: string;
    kalshiSeries?: string;
}
export interface DynamicMapping {
    name: string;
    category: string;
    frequency: 'daily' | 'monthly' | 'quarterly' | 'yearly';
    polymarket: {
        pattern: string;
        example: string;
    };
    kalshi: {
        series: string;
        pattern: string;
        example: string;
    };
}
export interface MarketMappings {
    static: StaticMapping[];
    dynamic: DynamicMapping[];
}
export interface MatchResult {
    name: string;
    category: string;
    type: 'static' | 'dynamic';
    polymarketSlug: string;
    kalshiTicker: string;
    kalshiSeries?: string;
    date?: Date;
}
/**
 * Load market mappings from config file.
 */
export declare function loadMappings(): MarketMappings;
/**
 * Clear cached mappings (useful for testing).
 */
export declare function clearCache(): void;
/**
 * Find a static mapping by Polymarket slug.
 */
export declare function findStaticByPolymarket(slug: string): StaticMapping | null;
/**
 * Find a static mapping by Kalshi ticker.
 */
export declare function findStaticByKalshi(ticker: string): StaticMapping | null;
/**
 * Try to match a Polymarket slug against dynamic patterns.
 */
export declare function matchDynamicPolymarket(slug: string): MatchResult | null;
/**
 * Try to match a Kalshi ticker against dynamic patterns.
 */
export declare function matchDynamicKalshi(ticker: string): MatchResult | null;
/**
 * Find a match for an identifier from either platform.
 *
 * @param identifier The slug (Polymarket) or ticker (Kalshi)
 * @param platform Which platform the identifier is from
 * @returns Match result with counterpart, or null if no match
 */
export declare function findMatch(identifier: string, platform: 'polymarket' | 'kalshi'): MatchResult | null;
/**
 * Generate all dynamic matches for a given date.
 *
 * @param date The date to generate matches for
 * @param category Optional category filter
 * @returns Array of match results
 */
export declare function generateDynamicMatches(date: Date, category?: string): MatchResult[];
/**
 * Generate all yearly dynamic matches for a given year.
 *
 * @param year The year to generate matches for (default: current year)
 * @param category Optional category filter
 * @returns Array of match results
 */
export declare function generateYearlyMatches(year?: number, category?: string): MatchResult[];
/**
 * Get all static mappings.
 */
export declare function getAllStaticMappings(): MatchResult[];
/**
 * Get all dynamic mapping configurations.
 */
export declare function getAllDynamicConfigs(): DynamicMapping[];
