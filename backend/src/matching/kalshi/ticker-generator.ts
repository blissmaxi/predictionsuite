/**
 * Kalshi Ticker Generator
 *
 * Generates and parses Kalshi tickers from dynamic patterns.
 */

// ============ Constants ============

const MONTHS_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

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
