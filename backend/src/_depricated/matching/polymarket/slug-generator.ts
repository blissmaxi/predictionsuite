/**
 * Polymarket Slug Generator
 *
 * Generates and parses Polymarket slugs from dynamic patterns.
 */

// ============ Constants ============

const MONTHS_FULL = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// ============ Slug Generation ============

/**
 * Generate Polymarket slug from dynamic pattern and date.
 *
 * Supported placeholders:
 * - {year} - Full year (e.g., 2026)
 * - {month} - Full month name lowercase (e.g., january)
 * - {day} - Day of month (e.g., 15)
 */
export function generatePolymarketSlug(pattern: string, date: Date): string {
  const year = date.getFullYear().toString();
  const month = MONTHS_FULL[date.getMonth()];
  const day = date.getDate().toString();

  return pattern
    .replace('{year}', year)
    .replace('{month}', month)
    .replace('{day}', day);
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
