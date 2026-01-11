/**
 * Blocking Strategy
 *
 * Pre-filtering to reduce the number of comparisons needed.
 * With ~5,000 Polymarket events × ~3,300 Kalshi events = 16.5M potential comparisons,
 * blocking reduces this to a manageable ~100K by only comparing events that share blocking keys.
 */

import type { UnifiedEvent } from '../types/unified.js';
import type { BlockingIndex, EventPair } from './types.js';
import {
  normalizeText,
  tokenizeWithSynonyms,
  extractYears,
  extractSignificantTokens,
  getFirstSignificantWord,
  generateNgrams,
} from './text-normalizer.js';

// ============ Key Generation ============

/**
 * Generate blocking keys for an event.
 * Events sharing at least one key will be compared.
 *
 * Key types:
 * - year:YYYY - Year mentioned in title
 * - cat:category - Normalized category
 * - tok:word - Significant tokens (length >= 4)
 * - 2g:word word - Bigrams
 * - first:word - First significant word
 *
 * @param event Event to generate keys for
 * @returns Set of blocking keys
 */
export function generateBlockingKeys(event: UnifiedEvent): Set<string> {
  const keys = new Set<string>();
  const normalizedTitle = normalizeText(event.title);

  // 1. Year keys (e.g., "year:2025")
  const years = extractYears(event.title);
  for (const year of years) {
    keys.add(`year:${year}`);
  }

  // 2. Category key (e.g., "cat:politics")
  if (event.category) {
    const normCategory = event.category.toLowerCase().trim();
    keys.add(`cat:${normCategory}`);
  }

  // 3. Significant token keys (e.g., "tok:trump", "tok:president")
  const tokens = tokenizeWithSynonyms(normalizedTitle);
  const sigTokens = extractSignificantTokens(normalizedTitle);
  for (const token of sigTokens) {
    keys.add(`tok:${token}`);
  }

  // 4. Bigram keys (e.g., "2g:super bowl", "2g:federal reserve")
  const bigrams = generateNgrams(tokens, 2);
  for (const bigram of bigrams) {
    keys.add(`2g:${bigram}`);
  }

  // 5. First significant word (e.g., "first:trump")
  const firstWord = getFirstSignificantWord(normalizedTitle);
  if (firstWord) {
    keys.add(`first:${firstWord}`);
  }

  // 6. Also add keys from market questions for better coverage
  for (const market of event.markets.slice(0, 5)) { // Limit to first 5 markets
    const normQuestion = normalizeText(market.question);
    const marketTokens = extractSignificantTokens(normQuestion);
    for (const token of marketTokens.slice(0, 3)) { // Top 3 tokens per market
      keys.add(`tok:${token}`);
    }
  }

  return keys;
}

// ============ Index Building ============

/**
 * Build blocking indices for a set of events.
 *
 * @param polymarketEvents Polymarket events
 * @param kalshiEvents Kalshi events
 * @returns Blocking index with events grouped by keys
 */
export function buildBlockingIndex(
  polymarketEvents: UnifiedEvent[],
  kalshiEvents: UnifiedEvent[]
): BlockingIndex {
  const index: BlockingIndex = {
    polymarket: new Map(),
    kalshi: new Map(),
  };

  // Index Polymarket events
  for (const event of polymarketEvents) {
    const keys = generateBlockingKeys(event);
    for (const key of keys) {
      if (!index.polymarket.has(key)) {
        index.polymarket.set(key, new Set());
      }
      index.polymarket.get(key)!.add(event.id);
    }
  }

  // Index Kalshi events
  for (const event of kalshiEvents) {
    const keys = generateBlockingKeys(event);
    for (const key of keys) {
      if (!index.kalshi.has(key)) {
        index.kalshi.set(key, new Set());
      }
      index.kalshi.get(key)!.add(event.id);
    }
  }

  return index;
}

// ============ Candidate Finding ============

/**
 * Find candidate pairs that share at least one blocking key.
 *
 * @param index Blocking index
 * @returns Set of candidate pairs to compare
 */
export function findCandidatePairs(index: BlockingIndex): Set<string> {
  const pairSet = new Set<string>();

  // For each Polymarket blocking key
  for (const [key, polyIds] of index.polymarket) {
    // Find Kalshi events with the same key
    const kalshiIds = index.kalshi.get(key);
    if (!kalshiIds) continue;

    // Add all pairs
    for (const polyId of polyIds) {
      for (const kalshiId of kalshiIds) {
        // Use consistent ordering for deduplication
        pairSet.add(`${polyId}||${kalshiId}`);
      }
    }
  }

  return pairSet;
}

/**
 * Parse a pair string back into event IDs.
 */
export function parsePairString(pairStr: string): EventPair {
  const [polymarketEventId, kalshiEventId] = pairStr.split('||');
  return { polymarketEventId, kalshiEventId };
}

/**
 * Create a pair string from event IDs.
 */
export function makePairString(polymarketEventId: string, kalshiEventId: string): string {
  return `${polymarketEventId}||${kalshiEventId}`;
}

// ============ Statistics ============

/**
 * Calculate blocking statistics.
 *
 * @param polymarketCount Number of Polymarket events
 * @param kalshiCount Number of Kalshi events
 * @param candidatePairCount Number of candidate pairs after blocking
 * @returns Statistics object
 */
export function calculateBlockingStats(
  polymarketCount: number,
  kalshiCount: number,
  candidatePairCount: number
): {
  totalPotential: number;
  actualComparisons: number;
  reduction: number;
  reductionPercent: string;
} {
  const totalPotential = polymarketCount * kalshiCount;
  const reduction = totalPotential - candidatePairCount;
  const reductionPercent = totalPotential > 0
    ? ((reduction / totalPotential) * 100).toFixed(1)
    : '0.0';

  return {
    totalPotential,
    actualComparisons: candidatePairCount,
    reduction,
    reductionPercent,
  };
}

// ============ High-Level API ============

/**
 * Find all candidate event pairs using blocking strategy.
 *
 * @param polymarketEvents Polymarket events
 * @param kalshiEvents Kalshi events
 * @returns Array of event pairs to compare
 */
export function findAllCandidatePairs(
  polymarketEvents: UnifiedEvent[],
  kalshiEvents: UnifiedEvent[]
): EventPair[] {
  // Build index
  const index = buildBlockingIndex(polymarketEvents, kalshiEvents);

  // Find pairs
  const pairStrings = findCandidatePairs(index);

  // Parse back to objects
  return Array.from(pairStrings).map(parsePairString);
}

/**
 * Get blocking statistics without returning pairs (for logging).
 *
 * @param polymarketEvents Polymarket events
 * @param kalshiEvents Kalshi events
 * @returns Statistics about blocking effectiveness
 */
export function getBlockingEffectiveness(
  polymarketEvents: UnifiedEvent[],
  kalshiEvents: UnifiedEvent[]
): {
  totalPotential: number;
  actualComparisons: number;
  reduction: number;
  reductionPercent: string;
  polymarketKeysCount: number;
  kalshiKeysCount: number;
} {
  const index = buildBlockingIndex(polymarketEvents, kalshiEvents);
  const pairStrings = findCandidatePairs(index);

  const stats = calculateBlockingStats(
    polymarketEvents.length,
    kalshiEvents.length,
    pairStrings.size
  );

  return {
    ...stats,
    polymarketKeysCount: index.polymarket.size,
    kalshiKeysCount: index.kalshi.size,
  };
}
