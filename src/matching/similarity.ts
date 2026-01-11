/**
 * Similarity Algorithms
 *
 * Algorithms for computing similarity between events and text.
 */

import type { UnifiedEvent } from '../types/unified.js';
import type { SimilaritySignals, SimilarityWeights } from './types.js';
import {
  normalizeText,
  tokenizeWithSynonyms,
  extractYears,
  extractMonths,
  generateNgrams,
  hasContradiction,
  extractEntities,
} from './text-normalizer.js';

// ============ String Distance ============

/**
 * Calculate Levenshtein (edit) distance between two strings.
 * Uses dynamic programming with early termination optimization.
 *
 * @param a First string
 * @param b Second string
 * @param maxDistance Optional max distance (for early termination)
 * @returns Edit distance
 */
export function levenshteinDistance(
  a: string,
  b: string,
  maxDistance?: number
): number {
  // Handle empty strings
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string (for memory efficiency)
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // Early termination if length difference exceeds max
  if (maxDistance !== undefined && Math.abs(aLen - bLen) > maxDistance) {
    return maxDistance + 1;
  }

  // Use single row optimization (only need previous row)
  let prevRow = new Array(aLen + 1);
  let currRow = new Array(aLen + 1);

  // Initialize first row
  for (let i = 0; i <= aLen; i++) {
    prevRow[i] = i;
  }

  // Fill in the matrix row by row
  for (let j = 1; j <= bLen; j++) {
    currRow[0] = j;
    let minInRow = j;

    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        prevRow[i] + 1,      // deletion
        currRow[i - 1] + 1,  // insertion
        prevRow[i - 1] + cost // substitution
      );
      minInRow = Math.min(minInRow, currRow[i]);
    }

    // Early termination if min in row exceeds max
    if (maxDistance !== undefined && minInRow > maxDistance) {
      return maxDistance + 1;
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[aLen];
}

/**
 * Calculate normalized Levenshtein similarity (0-1).
 *
 * @param a First string
 * @param b Second string
 * @returns Similarity score (1 = identical, 0 = completely different)
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

// ============ Set-Based Similarity ============

/**
 * Calculate Jaccard similarity coefficient between two sets.
 * Jaccard = |A ∩ B| / |A ∪ B|
 *
 * @param setA First set
 * @param setB Second set
 * @returns Jaccard coefficient (0-1)
 */
export function jaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Calculate token overlap similarity using Jaccard with synonym normalization.
 *
 * @param textA First text (normalized)
 * @param textB Second text (normalized)
 * @returns Token overlap score (0-1)
 */
export function tokenOverlapSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(tokenizeWithSynonyms(textA));
  const tokensB = new Set(tokenizeWithSynonyms(textB));
  return jaccardSimilarity(tokensA, tokensB);
}

/**
 * Calculate bigram overlap similarity.
 *
 * @param textA First text (normalized)
 * @param textB Second text (normalized)
 * @returns Bigram overlap score (0-1)
 */
export function bigramOverlapSimilarity(textA: string, textB: string): number {
  const tokensA = tokenizeWithSynonyms(textA);
  const tokensB = tokenizeWithSynonyms(textB);

  const bigramsA = new Set(generateNgrams(tokensA, 2));
  const bigramsB = new Set(generateNgrams(tokensB, 2));

  return jaccardSimilarity(bigramsA, bigramsB);
}

// ============ Date Similarity ============

/**
 * Calculate date proximity score based on year/month references in text.
 *
 * @param textA First text (normalized)
 * @param textB Second text (normalized)
 * @returns Date proximity score (1=same date references, 0=different)
 */
export function dateProximityScore(textA: string, textB: string): number {
  const yearsA = extractYears(textA);
  const yearsB = extractYears(textB);
  const monthsA = extractMonths(textA);
  const monthsB = extractMonths(textB);

  // No date references in either - neutral score
  if (yearsA.length === 0 && yearsB.length === 0 &&
      monthsA.length === 0 && monthsB.length === 0) {
    return 0.5;
  }

  let score = 0;
  let components = 0;

  // Year comparison
  if (yearsA.length > 0 || yearsB.length > 0) {
    const yearSetA = new Set(yearsA);
    const yearSetB = new Set(yearsB);
    const yearOverlap = jaccardSimilarity(yearSetA, yearSetB);
    score += yearOverlap;
    components++;
  }

  // Month comparison
  if (monthsA.length > 0 || monthsB.length > 0) {
    const monthSetA = new Set(monthsA);
    const monthSetB = new Set(monthsB);
    const monthOverlap = jaccardSimilarity(monthSetA, monthSetB);
    score += monthOverlap;
    components++;
  }

  return components > 0 ? score / components : 0.5;
}

/**
 * Calculate date proximity from actual ISO date strings.
 *
 * @param dateA ISO date string or undefined
 * @param dateB ISO date string or undefined
 * @returns Proximity score (1=same day, decays over 30 days, 0=30+ days)
 */
export function dateStringProximity(
  dateA: string | undefined,
  dateB: string | undefined
): number {
  if (!dateA || !dateB) return 0.5; // Neutral if missing

  const timeA = new Date(dateA).getTime();
  const timeB = new Date(dateB).getTime();

  if (isNaN(timeA) || isNaN(timeB)) return 0.5;

  const diffDays = Math.abs(timeA - timeB) / (1000 * 60 * 60 * 24);

  if (diffDays === 0) return 1;
  if (diffDays >= 30) return 0;

  // Linear decay over 30 days
  return 1 - diffDays / 30;
}

// ============ Market Date Similarity ============

/**
 * Get the earliest market end date from an event.
 * This is more reliable than event-level dates since both platforms provide market dates.
 */
function getEarliestMarketEndDate(event: UnifiedEvent): Date | null {
  let earliest: Date | null = null;

  for (const market of event.markets) {
    if (!market.endDate) continue;
    const date = new Date(market.endDate);
    if (isNaN(date.getTime())) continue;
    if (!earliest || date < earliest) {
      earliest = date;
    }
  }

  return earliest;
}

/**
 * Calculate date proximity based on market close dates.
 * Uses the earliest closing market from each event.
 *
 * This is the most reliable date signal since both platforms provide market end dates,
 * unlike event-level dates which are often missing (especially on Kalshi).
 *
 * @param eventA First event
 * @param eventB Second event
 * @returns 1.0 = close within 7 days, 0.0 = 90+ days apart, 0.5 = missing data
 */
export function marketEndDateProximity(
  eventA: UnifiedEvent,
  eventB: UnifiedEvent
): number {
  const dateA = getEarliestMarketEndDate(eventA);
  const dateB = getEarliestMarketEndDate(eventB);

  // Neutral if either is missing
  if (!dateA || !dateB) return 0.5;

  const diffDays = Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24);

  // Same week = perfect match
  if (diffDays <= 7) return 1.0;

  // 90+ days apart = no match (different time horizons)
  if (diffDays >= 90) return 0.0;

  // Linear decay between 7-90 days
  return 1 - (diffDays - 7) / (90 - 7);
}

// ============ Category Similarity ============

/**
 * Category mappings for normalization.
 */
const CATEGORY_MAP: Record<string, string> = {
  // Polymarket categories → canonical
  'politics': 'politics',
  'us politics': 'politics',
  'us elections': 'politics',
  'elections': 'politics',
  'world': 'politics',
  'geopolitics': 'politics',

  'sports': 'sports',
  'nfl': 'sports',
  'nba': 'sports',
  'mlb': 'sports',
  'soccer': 'sports',
  'football': 'sports',

  'crypto': 'crypto',
  'cryptocurrency': 'crypto',
  'bitcoin': 'crypto',
  'ethereum': 'crypto',

  'business': 'business',
  'finance': 'business',
  'economics': 'business',
  'economy': 'business',
  'markets': 'business',
  'stocks': 'business',

  'science': 'science',
  'technology': 'tech',
  'tech': 'tech',
  'ai': 'tech',

  'entertainment': 'entertainment',
  'culture': 'entertainment',
  'awards': 'entertainment',
  'oscars': 'entertainment',

  'weather': 'weather',
  'climate': 'weather',

  // Kalshi categories → canonical
  'financials': 'business',
  'fed': 'business',
  'indices': 'business',
};

/**
 * Normalize a category string.
 */
function normalizeCategory(category: string | undefined): string {
  if (!category) return 'unknown';
  const lower = category.toLowerCase().trim();
  return CATEGORY_MAP[lower] || lower;
}

/**
 * Calculate category match score.
 *
 * @param categoryA First category
 * @param categoryB Second category
 * @returns Score (1=exact match, 0.75=partial, 0=mismatch)
 */
export function categoryMatchScore(
  categoryA: string | undefined,
  categoryB: string | undefined
): number {
  const normA = normalizeCategory(categoryA);
  const normB = normalizeCategory(categoryB);

  // Exact match
  if (normA === normB) return 1;

  // Both unknown - neutral
  if (normA === 'unknown' || normB === 'unknown') return 0.5;

  // Different categories
  return 0;
}

// ============ Market Similarity ============

/**
 * Calculate best market question similarity between two events.
 * Compares all market questions from both events and returns the best match.
 *
 * @param eventA First event
 * @param eventB Second event
 * @returns Best market similarity score (0-1)
 */
export function bestMarketSimilarity(
  eventA: UnifiedEvent,
  eventB: UnifiedEvent
): number {
  if (eventA.markets.length === 0 || eventB.markets.length === 0) {
    return 0;
  }

  let bestScore = 0;

  for (const marketA of eventA.markets) {
    const normA = normalizeText(marketA.question);

    for (const marketB of eventB.markets) {
      const normB = normalizeText(marketB.question);

      // Combine Levenshtein and token overlap
      const levenScore = levenshteinSimilarity(normA, normB);
      const tokenScore = tokenOverlapSimilarity(normA, normB);

      // Weight towards Levenshtein for exact matches
      const combinedScore = levenScore * 0.6 + tokenScore * 0.4;

      bestScore = Math.max(bestScore, combinedScore);

      // Early exit if we found a near-perfect match
      if (bestScore > 0.95) return bestScore;
    }
  }

  return bestScore;
}

// ============ Entity Similarity ============

/**
 * Calculate entity match score between two titles.
 * Extracts named entities (people, companies) and compares overlap.
 *
 * @param titleA First title
 * @param titleB Second title
 * @returns Score: 1=same entities, 0.5=no entities, 0.1=different entities
 */
export function entityMatchScore(titleA: string, titleB: string): number {
  const entitiesA = extractEntities(titleA);
  const entitiesB = extractEntities(titleB);

  // No entities in either - neutral (don't penalize or reward)
  if (entitiesA.length === 0 && entitiesB.length === 0) {
    return 0.5;
  }

  // One has entities, other doesn't - slight penalty
  if (entitiesA.length === 0 || entitiesB.length === 0) {
    return 0.4;
  }

  // Both have entities - check overlap
  const setA = new Set(entitiesA);
  const setB = new Set(entitiesB);

  let intersection = 0;
  for (const e of setA) {
    if (setB.has(e)) intersection++;
  }

  // No overlap = different events (strong penalty)
  if (intersection === 0) {
    return 0.1;
  }

  // Calculate Jaccard similarity
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

// ============ Combined Similarity ============

/**
 * Calculate all similarity signals between two events.
 *
 * @param eventA First event (typically Polymarket)
 * @param eventB Second event (typically Kalshi)
 * @returns All similarity signals
 */
export function calculateSimilaritySignals(
  eventA: UnifiedEvent,
  eventB: UnifiedEvent
): SimilaritySignals {
  const normTitleA = normalizeText(eventA.title);
  const normTitleB = normalizeText(eventB.title);

  return {
    titleSimilarity: levenshteinSimilarity(normTitleA, normTitleB),
    tokenOverlap: tokenOverlapSimilarity(normTitleA, normTitleB),
    marketSimilarity: bestMarketSimilarity(eventA, eventB),
    dateProximity: combineEndDateAndTextDate(eventA, eventB, normTitleA, normTitleB),
    categoryMatch: categoryMatchScore(eventA.category, eventB.category),
  };
}

/**
 * Combine multiple date signals with priority:
 * 1. Market close dates (most reliable - both platforms provide)
 * 2. Text-based date extraction
 *
 * IMPORTANT: Only use date signal if there's a date reference in at least one title.
 * Otherwise return neutral (0.5) so date doesn't affect the score.
 */
function combineEndDateAndTextDate(
  eventA: UnifiedEvent,
  eventB: UnifiedEvent,
  normTitleA: string,
  normTitleB: string
): number {
  // Check if either title contains date references (years or months)
  const yearsA = extractYears(eventA.title);
  const yearsB = extractYears(eventB.title);
  const monthsA = extractMonths(normTitleA);
  const monthsB = extractMonths(normTitleB);

  const hasDateInTitles =
    yearsA.length > 0 || yearsB.length > 0 ||
    monthsA.length > 0 || monthsB.length > 0;

  // If no date references in either title, return neutral (don't use date signal)
  if (!hasDateInTitles) {
    return 0.5;
  }

  // Date references found - use market close dates as primary signal
  const marketDateScore = marketEndDateProximity(eventA, eventB);
  const textDateScore = dateProximityScore(normTitleA, normTitleB);

  // If market dates are available and conclusive (not 0.5 neutral)
  if (marketDateScore !== 0.5) {
    // Markets closing 90+ days apart = strong negative signal
    if (marketDateScore === 0) return 0.1;  // Almost disqualifying
    // Markets closing within a week = strong positive signal
    if (marketDateScore === 1) return 0.95;
    // Otherwise blend with text score
    return marketDateScore * 0.8 + textDateScore * 0.2;
  }

  // Fall back to text-based date extraction
  return textDateScore;
}

/**
 * Combine similarity signals into a final score using weights.
 * Applies caps for contradictions and entity mismatches.
 *
 * @param signals Individual similarity signals
 * @param weights Weights for each signal
 * @param titleA Original title A (for contradiction/entity checks)
 * @param titleB Original title B (for contradiction/entity checks)
 * @returns Combined score (0-1)
 */
export function combineSignals(
  signals: SimilaritySignals,
  weights: SimilarityWeights,
  titleA?: string,
  titleB?: string
): number {
  // Check for contradictions FIRST (if titles provided)
  if (titleA && titleB && hasContradiction(titleA, titleB)) {
    // Cap score at 50% regardless of other signals
    const baseScore = signals.titleSimilarity * 0.5 + signals.tokenOverlap * 0.5;
    return Math.min(0.50, baseScore);
  }

  // Check entity mismatch (if titles provided)
  if (titleA && titleB) {
    const entityScore = entityMatchScore(titleA, titleB);
    if (entityScore <= 0.1) {
      // Different entities - cap at 55%
      const baseScore = signals.titleSimilarity * 0.4 + signals.tokenOverlap * 0.4 + entityScore * 0.2;
      return Math.min(0.55, baseScore);
    }
  }

  // Normal scoring
  const totalWeight =
    weights.titleSimilarity +
    weights.tokenOverlap +
    weights.marketSimilarity +
    weights.dateProximity +
    weights.categoryMatch;

  const weightedSum =
    signals.titleSimilarity * weights.titleSimilarity +
    signals.tokenOverlap * weights.tokenOverlap +
    signals.marketSimilarity * weights.marketSimilarity +
    signals.dateProximity * weights.dateProximity +
    signals.categoryMatch * weights.categoryMatch;

  return weightedSum / totalWeight;
}
