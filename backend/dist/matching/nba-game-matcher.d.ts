/**
 * NBA Game Matcher
 *
 * Fetches NBA game events from Polymarket, parses team codes and dates,
 * and generates corresponding Kalshi tickers for cross-platform matching.
 *
 * URL Formats:
 * - Polymarket: nba-{away}-{home}-{YYYY}-{MM}-{DD} (e.g., nba-phx-mia-2026-01-13)
 * - Kalshi: KXNBAGAME-{YY}{MON}{DD}{AWAY}{HOME} (e.g., KXNBAGAME-26JAN13PHXMIA)
 */
export interface NbaGameMatch {
    /** Game date */
    date: Date;
    /** Away team canonical name (e.g., "phoenix suns") */
    awayTeam: string;
    /** Home team canonical name (e.g., "miami heat") */
    homeTeam: string;
    /** Away team 3-letter code (e.g., "phx") */
    awayCode: string;
    /** Home team 3-letter code (e.g., "mia") */
    homeCode: string;
    /** Polymarket event slug */
    polymarketSlug: string;
    /** Kalshi event ticker */
    kalshiTicker: string;
    /** Kalshi series for API fetching */
    kalshiSeries: string;
}
interface ParsedNbaSlug {
    awayCode: string;
    homeCode: string;
    date: Date;
}
/**
 * Get team name from 3-letter code.
 */
export declare function getTeamFromCode(code: string): string | null;
/**
 * Parse a Polymarket NBA game slug.
 *
 * @param slug - e.g., "nba-phx-mia-2026-01-13"
 * @returns Parsed data or null if not a valid NBA game slug
 */
export declare function parsePolymarketNbaSlug(slug: string): ParsedNbaSlug | null;
/**
 * Check if a slug is an NBA game slug.
 */
export declare function isNbaGameSlug(slug: string): boolean;
/**
 * Generate Kalshi event ticker from game info.
 *
 * @param date - Game date
 * @param awayCode - Away team 3-letter code (lowercase)
 * @param homeCode - Home team 3-letter code (lowercase)
 * @returns Kalshi ticker, e.g., "KXNBAGAME-26JAN13PHXMIA"
 */
export declare function generateKalshiNbaTicker(date: Date, awayCode: string, homeCode: string): string;
/**
 * Generate Polymarket slug from game info.
 *
 * @param date - Game date
 * @param awayCode - Away team 3-letter code
 * @param homeCode - Home team 3-letter code
 * @returns Polymarket slug, e.g., "nba-phx-mia-2026-01-13"
 */
export declare function generatePolymarketNbaSlug(date: Date, awayCode: string, homeCode: string): string;
/**
 * Fetch NBA game events from Kalshi and generate Polymarket slugs.
 *
 * Strategy: Fetch games from Kalshi (which has comprehensive listings),
 * then construct corresponding Polymarket slugs for cross-platform matching.
 *
 * @param startDate - Start of date range (inclusive)
 * @param endDate - End of date range (inclusive)
 */
export declare function fetchNbaGameMatches(startDate: Date, endDate: Date): Promise<NbaGameMatch[]>;
/**
 * Format a game match for display.
 */
export declare function formatGameMatch(match: NbaGameMatch): string;
export {};
