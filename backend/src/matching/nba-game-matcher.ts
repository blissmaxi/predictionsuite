/**
 * NBA Game Matcher
 *
 * Fetches NBA game events from Kalshi, parses team codes and dates,
 * and generates corresponding Polymarket slugs for cross-platform matching.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { generatePolymarketNbaSlug } from './polymarket/nba-parser.js';
import { parseKalshiNbaTicker, KALSHI_NBA_SERIES } from './kalshi/nba-parser.js';

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

interface TeamCodes {
  [code: string]: string;
}

// ============ Team Code Lookup ============

let cachedTeamCodes: TeamCodes | null = null;

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

function getTeamFromCode(code: string): string | null {
  const codes = loadTeamCodes();
  return codes[code.toLowerCase()] || null;
}

// ============ Event Discovery ============

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
    const response = await fetch(
      `https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=${KALSHI_NBA_SERIES}&limit=100&status=open`
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

      if (!awayTeam || !homeTeam) continue;

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
        kalshiSeries: KALSHI_NBA_SERIES,
      });
    }
  } catch (error) {
    console.error('Error fetching NBA games:', error);
  }

  matches.sort((a, b) => a.date.getTime() - b.date.getTime());

  return matches;
}
