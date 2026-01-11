/**
 * Matching Types
 *
 * Type definitions for the event matching system.
 */

import type { UnifiedEvent, Platform } from '../types/unified.js';

// ============ Similarity Types ============

/**
 * Individual similarity signals computed between two events.
 */
export interface SimilaritySignals {
  /** Normalized title similarity (0-1) using Levenshtein */
  titleSimilarity: number;
  /** Token overlap using Jaccard coefficient (0-1) */
  tokenOverlap: number;
  /** Best market question similarity (0-1) */
  marketSimilarity: number;
  /** Date proximity score (1=same day, 0=30+ days apart) */
  dateProximity: number;
  /** Category match (1=exact, 0.75=partial, 0=mismatch) */
  categoryMatch: number;
}

/**
 * Weights for combining similarity signals into a final score.
 */
export interface SimilarityWeights {
  titleSimilarity: number;
  tokenOverlap: number;
  marketSimilarity: number;
  dateProximity: number;
  categoryMatch: number;
}

// ============ Match Types ============

/**
 * Result of comparing two events - a potential match candidate.
 */
export interface MatchCandidate {
  /** Polymarket event */
  polymarketEvent: UnifiedEvent;
  /** Kalshi event */
  kalshiEvent: UnifiedEvent;
  /** Overall match score (0-1) */
  score: number;
  /** Individual similarity signals */
  signals: SimilaritySignals;
}

/**
 * A confirmed match between events for persistence.
 */
export interface EventMatch {
  polymarketEventId: string;
  kalshiEventId: string;
  /** Confidence score at time of match */
  confidence: number;
  /** How the match was created */
  source: 'auto' | 'manual';
  /** When the match was created */
  createdAt: string;
}

/**
 * A confirmed match between specific markets.
 */
export interface MarketMatch {
  polymarketMarketId: string;
  kalshiMarketId: string;
  /** Parent event match reference */
  eventMatchId?: string;
  confidence: number;
  source: 'auto' | 'manual';
  createdAt: string;
}

/**
 * A rejected pair that should not be matched.
 */
export interface RejectedPair {
  polymarketEventId: string;
  kalshiEventId: string;
  /** Optional reason for rejection */
  reason?: string;
  rejectedAt: string;
}

// ============ Cache Types ============

/**
 * Cache file format for persisting matches.
 */
export interface MatchCacheData {
  /** Schema version for migrations */
  version: number;
  /** Last update timestamp */
  lastUpdated: string;
  /** Confirmed event matches */
  eventMatches: EventMatch[];
  /** Confirmed market matches */
  marketMatches: MarketMatch[];
  /** Rejected pairs */
  rejectedPairs: RejectedPair[];
}

// ============ Configuration ============

/**
 * Matcher configuration options.
 */
export interface MatcherConfig {
  /** Minimum score to consider a confirmed match (default: 0.85) */
  minMatchThreshold: number;
  /** Minimum score to include as candidate for review (default: 0.5) */
  minCandidateThreshold: number;
  /** Weights for combining similarity signals */
  weights: SimilarityWeights;
  /** Path to cache file */
  cachePath: string;
}

/**
 * Default matcher configuration.
 *
 * Note: Title and token overlap are weighted heavily as they're
 * the most reliable signals. Market similarity is disabled (0) because
 * market questions vary significantly even for the same event.
 */
export const DEFAULT_MATCHER_CONFIG: MatcherConfig = {
  minMatchThreshold: 0.75,
  minCandidateThreshold: 0.5,
  weights: {
    titleSimilarity: 0.6,  // Primary signal
    tokenOverlap: 0.4,     // Equal weight with title
    marketSimilarity: 0.00, // Disabled - too noisy
    dateProximity: 0.00,    // Important for disambiguation
    categoryMatch: 0.00,    // Disabled
  },
  cachePath: 'data/match-cache.json',
};

// ============ Blocking Types ============

/**
 * A pair of event IDs to compare.
 */
export interface EventPair {
  polymarketEventId: string;
  kalshiEventId: string;
}

/**
 * Index mapping blocking keys to event IDs.
 */
export interface BlockingIndex {
  /** Polymarket events by blocking key */
  polymarket: Map<string, Set<string>>;
  /** Kalshi events by blocking key */
  kalshi: Map<string, Set<string>>;
}

// ============ Result Types ============

/**
 * Result of the matching process.
 */
export interface MatchingResult {
  /** All candidates above minimum threshold */
  candidates: MatchCandidate[];
  /** Confirmed matches (score >= minMatchThreshold) */
  confirmed: MatchCandidate[];
  /** Uncertain matches (between minCandidateThreshold and minMatchThreshold) */
  uncertain: MatchCandidate[];
  /** Statistics about the matching process */
  stats: MatchingStats;
}

/**
 * Statistics about the matching process.
 */
export interface MatchingStats {
  /** Total potential comparisons without blocking */
  totalPotentialComparisons: number;
  /** Actual comparisons after blocking */
  actualComparisons: number;
  /** Reduction percentage from blocking */
  blockingReduction: number;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Number of Polymarket events */
  polymarketEventCount: number;
  /** Number of Kalshi events */
  kalshiEventCount: number;
}
