/**
 * Kalshi Ticker Generator
 *
 * Generates and parses Kalshi tickers from dynamic patterns.
 */

import type { ParsedNbaGame } from '../types.js';
// ============ Constants ============

export const MONTHS_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

/** Kalshi series ticker for NBA games */
export const KALSHI_NBA_SERIES = 'KXNBAGAME';

/** Regex to parse Kalshi NBA game ticker */
const KALSHI_NBA_TICKER_REGEX = /^KXNBAGAME-(\d{2})([A-Z]{3})(\d{2})([A-Z]{3})([A-Z]{3})$/;

// ============ Ticker Generation ============

/**
 * Generate Kalshi ticker from dynamic pattern and date.
 *
 * Supported placeholders:
 * - {yy} - Two-digit year (e.g., 26)
 * - {MON} - Three-letter month uppercase (e.g., JAN)
 * - {dd} - Two-digit day (e.g., 15)
 */
export function generateKalshiTicker(pattern: string, date: Date): string {
  const yy = date.getFullYear().toString().slice(-2);
  const mon = MONTHS_SHORT[date.getMonth()];
  const dd = date.getDate().toString().padStart(2, '0');

  return pattern
    .replace('{yy}', yy)
    .replace('{MON}', mon)
    .replace('{dd}', dd);
}


/**
 * Parse a Kalshi NBA game ticker.
 *
 * @param ticker - e.g., "KXNBAGAME-26JAN13PHXMIA"
 * @returns Parsed data or null if not a valid NBA game ticker
 */
export function parseKalshiNbaTicker(ticker: string): ParsedNbaGame | null {
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