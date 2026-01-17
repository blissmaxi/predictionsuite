/**
 * Polymarket NBA Game Parser
 *
 * Generates Polymarket NBA game slugs.
 *
 * URL Format: nba-{away}-{home}-{YYYY}-{MM}-{DD}
 * Example: nba-phx-mia-2026-01-13
 */

// ============ Slug Generation ============

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
