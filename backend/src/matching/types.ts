/**
 * Shared Types for Matching Module
 *
 * Common interfaces used across platform-specific matchers.
 */

/**
 * Parsed NBA game information extracted from a slug or ticker.
 */
export interface ParsedNbaGame {
  /** Away team 3-letter code (lowercase, e.g., "phx") */
  awayCode: string;
  /** Home team 3-letter code (lowercase, e.g., "mia") */
  homeCode: string;
  /** Game date */
  date: Date;
}
