/**
 * Catalog Matcher
 *
 * Reads market mappings from config/market-mappings.json and provides
 * functions to generate matches between Polymarket and Kalshi.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { generatePolymarketSlug } from './polymarket/slug-generator.js';
import { generateKalshiTicker } from './kalshi/ticker-generator.js';

// ============ Types ============

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
  static: Array<{
    name: string;
    category: string;
    polymarket: string;
    kalshi: string;
    kalshiSeries?: string;
  }>;
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

// ============ Config Loading ============

let cachedMappings: MarketMappings | null = null;

/**
 * Load market mappings from config file.
 */
export function loadMappings(): MarketMappings {
  if (cachedMappings) return cachedMappings;

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configPath = join(__dirname, '../../config/market-mappings.json');

  const content = readFileSync(configPath, 'utf-8');
  cachedMappings = JSON.parse(content) as MarketMappings;

  return cachedMappings;
}

// ============ Match Generation ============

/**
 * Generate all dynamic matches for a given date.
 *
 * @param date The date to generate matches for
 * @param category Optional category filter
 * @returns Array of match results
 */
export function generateDynamicMatches(
  date: Date,
  category?: string
): MatchResult[] {
  const mappings = loadMappings();
  const results: MatchResult[] = [];

  for (const dynamic of mappings.dynamic) {
    if (category && dynamic.category !== category) continue;

    if (dynamic.frequency === 'daily') {
      results.push({
        name: dynamic.name,
        category: dynamic.category,
        type: 'dynamic',
        polymarketSlug: generatePolymarketSlug(dynamic.polymarket.pattern, date),
        kalshiTicker: generateKalshiTicker(dynamic.kalshi.pattern, date),
        kalshiSeries: dynamic.kalshi.series,
        date,
      });
    }
  }

  return results;
}

/**
 * Generate all yearly dynamic matches for a given year.
 *
 * @param year The year to generate matches for (default: current year)
 * @param category Optional category filter
 * @returns Array of match results
 */
export function generateYearlyMatches(
  year?: number,
  category?: string
): MatchResult[] {
  const mappings = loadMappings();
  const results: MatchResult[] = [];
  const targetYear = year || new Date().getFullYear();
  const date = new Date(targetYear, 0, 1);

  for (const dynamic of mappings.dynamic) {
    if (category && dynamic.category !== category) continue;

    if (dynamic.frequency === 'yearly') {
      results.push({
        name: dynamic.name,
        category: dynamic.category,
        type: 'dynamic',
        polymarketSlug: generatePolymarketSlug(dynamic.polymarket.pattern, date),
        kalshiTicker: generateKalshiTicker(dynamic.kalshi.pattern, date),
        kalshiSeries: dynamic.kalshi.series,
        date,
      });
    }
  }

  return results;
}
