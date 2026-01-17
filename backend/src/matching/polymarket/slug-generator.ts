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
