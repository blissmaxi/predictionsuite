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

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { POLYMARKET } from '../config/api.js';

// ============ Types ============

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

interface TeamCodes {
  [code: string]: string;
}

// ============ Constants ============

const MONTHS_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

const KALSHI_SERIES = 'KXNBAGAME';

// Regex to match Polymarket NBA game slugs: nba-{away}-{home}-{yyyy}-{mm}-{dd}
const POLY_NBA_SLUG_REGEX = /^nba-([a-z]{3})-([a-z]{3})-(\d{4})-(\d{2})-(\d{2})$/;

// ============ Team Code Lookup ============

let cachedTeamCodes: TeamCodes | null = null;

/**
 * Load NBA team code lookup from config.
 */
function loadTeamCodes(): TeamCodes {
  if (cachedTeamCodes) return cachedTeamCodes;

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configPath = join(__dirname, '../../config/teams.json');
  const content = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(content);

  const codes: TeamCodes = config.nba_codes || {};
  cachedTeamCodes = codes;
  return codes;
}

/**
 * Get team name from 3-letter code.
 */
export function getTeamFromCode(code: string): string | null {
  const codes = loadTeamCodes();
  return codes[code.toLowerCase()] || null;
}

// ============ Slug Parsing ============

/**
 * Parse a Polymarket NBA game slug.
 *
 * @param slug - e.g., "nba-phx-mia-2026-01-13"
 * @returns Parsed data or null if not a valid NBA game slug
 */
export function parsePolymarketNbaSlug(slug: string): ParsedNbaSlug | null {
  const match = slug.match(POLY_NBA_SLUG_REGEX);
  if (!match) return null;

  const [, awayCode, homeCode, year, month, day] = match;
  const date = new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10)
  );

  return { awayCode, homeCode, date };
}

/**
 * Check if a slug is an NBA game slug.
 */
export function isNbaGameSlug(slug: string): boolean {
  return POLY_NBA_SLUG_REGEX.test(slug);
}

// ============ Ticker Generation ============

/**
 * Generate Kalshi event ticker from game info.
 *
 * @param date - Game date
 * @param awayCode - Away team 3-letter code (lowercase)
 * @param homeCode - Home team 3-letter code (lowercase)
 * @returns Kalshi ticker, e.g., "KXNBAGAME-26JAN13PHXMIA"
 */
export function generateKalshiNbaTicker(
  date: Date,
  awayCode: string,
  homeCode: string
): string {
  const yy = date.getFullYear().toString().slice(-2);
  const mon = MONTHS_SHORT[date.getMonth()];
  const dd = date.getDate().toString().padStart(2, '0');

  return `${KALSHI_SERIES}-${yy}${mon}${dd}${awayCode.toUpperCase()}${homeCode.toUpperCase()}`;
}

/**
 * Generate Polymarket slug from game info.
 *
 * @param date - Game date
 * @param awayCode - Away team 3-letter code
 * @param homeCode - Home team 3-letter code
 * @returns Polymarket slug, e.g., "nba-phx-mia-2026-01-13"
 */
export function generatePolymarketNbaSlug(
  date: Date,
  awayCode: string,
  homeCode: string
): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `nba-${awayCode.toLowerCase()}-${homeCode.toLowerCase()}-${year}-${month}-${day}`;
}

// ============ Event Discovery ============

// Regex to parse Kalshi NBA game ticker: KXNBAGAME-{YY}{MON}{DD}{AWAY}{HOME}
const KALSHI_NBA_TICKER_REGEX = /^KXNBAGAME-(\d{2})([A-Z]{3})(\d{2})([A-Z]{3})([A-Z]{3})$/;

/**
 * Parse a Kalshi NBA game ticker.
 *
 * @param ticker - e.g., "KXNBAGAME-26JAN13PHXMIA"
 * @returns Parsed data or null if not a valid NBA game ticker
 */
function parseKalshiNbaTicker(ticker: string): ParsedNbaSlug | null {
  const match = ticker.match(KALSHI_NBA_TICKER_REGEX);
  if (!match) return null;

  const [, yy, mon, dd, awayCode, homeCode] = match;

  const monthIndex = MONTHS_SHORT.indexOf(mon);
  if (monthIndex === -1) return null;

  const year = 2000 + parseInt(yy, 10);
  const day = parseInt(dd, 10);
  const date = new Date(year, monthIndex, day);

  return {
    awayCode: awayCode.toLowerCase(),
    homeCode: homeCode.toLowerCase(),
    date,
  };
}

/**
 * Fetch NBA game events from Kalshi and generate Polymarket slugs.
 *
 * Strategy: Fetch games from Kalshi (which has comprehensive listings),
 * then construct corresponding Polymarket slugs for cross-platform matching.
 *
 * @param startDate - Start of date range (inclusive)
 * @param endDate - End of date range (inclusive)
 */
export async function fetchNbaGameMatches(
  startDate: Date,
  endDate: Date
): Promise<NbaGameMatch[]> {
  const matches: NbaGameMatch[] = [];

  try {
    // Fetch open NBA game events from Kalshi
    const response = await fetch(
      `https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=${KALSHI_SERIES}&limit=100&status=open`
    );

    if (!response.ok) {
      console.error(`Failed to fetch Kalshi events: ${response.status}`);
      return matches;
    }

    const data = await response.json();
    const events = data.events || [];

    for (const event of events) {
      const ticker = event.event_ticker;
      if (!ticker) continue;

      const parsed = parseKalshiNbaTicker(ticker);
      if (!parsed) continue;

      // Check if game is within date range
      const gameDate = parsed.date;
      const startOfDay = new Date(startDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);

      if (gameDate < startOfDay || gameDate > endOfDay) continue;

      // Look up team names
      const awayTeam = getTeamFromCode(parsed.awayCode);
      const homeTeam = getTeamFromCode(parsed.homeCode);

      if (!awayTeam || !homeTeam) {
        // Skip unknown teams silently
        continue;
      }

      matches.push({
        date: gameDate,
        awayTeam,
        homeTeam,
        awayCode: parsed.awayCode,
        homeCode: parsed.homeCode,
        polymarketSlug: generatePolymarketNbaSlug(
          gameDate,
          parsed.awayCode,
          parsed.homeCode
        ),
        kalshiTicker: ticker,
        kalshiSeries: KALSHI_SERIES,
      });
    }
  } catch (error) {
    console.error('Error fetching NBA games:', error);
  }

  // Sort by date
  matches.sort((a, b) => a.date.getTime() - b.date.getTime());

  return matches;
}

/**
 * Format a game match for display.
 */
export function formatGameMatch(match: NbaGameMatch): string {
  const dateStr = match.date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return `${match.awayCode.toUpperCase()} @ ${match.homeCode.toUpperCase()} (${dateStr})`;
}
