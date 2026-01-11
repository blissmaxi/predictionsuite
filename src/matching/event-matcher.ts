/**
 * Event Matcher
 *
 * Main orchestrator for matching events across Polymarket and Kalshi.
 * Uses blocking strategy for efficiency and caches results.
 */

import type { UnifiedEvent } from '../types/unified.js';
import type {
  MatcherConfig,
  MatchCandidate,
  MatchingResult,
  MatchingStats,
  EventPair,
} from './types.js';
import { DEFAULT_MATCHER_CONFIG } from './types.js';
import { calculateSimilaritySignals, combineSignals } from './similarity.js';
import {
  buildBlockingIndex,
  findCandidatePairs,
  parsePairString,
  calculateBlockingStats,
} from './blocking-strategy.js';
import { MatchCache, createMatchCache } from './match-cache.js';

// ============ EventMatcher Class ============

/**
 * Main class for matching events across platforms.
 */
export class EventMatcher {
  private config: MatcherConfig;
  private cache: MatchCache | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<MatcherConfig> = {}) {
    this.config = { ...DEFAULT_MATCHER_CONFIG, ...config };
  }

  // ============ Initialization ============

  /**
   * Initialize the matcher by loading the cache.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.cache = await createMatchCache(this.config.cachePath);
    this.initialized = true;
  }

  /**
   * Ensure matcher is initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.cache) {
      throw new Error('EventMatcher not initialized. Call initialize() first.');
    }
  }

  // ============ Main Matching ============

  /**
   * Find all match candidates between Polymarket and Kalshi events.
   *
   * @param polymarketEvents Polymarket events
   * @param kalshiEvents Kalshi events
   * @returns Matching result with candidates, confirmed, and uncertain matches
   */
  async findMatches(
    polymarketEvents: UnifiedEvent[],
    kalshiEvents: UnifiedEvent[]
  ): Promise<MatchingResult> {
    await this.initialize();
    this.ensureInitialized();

    const startTime = Date.now();

    // Build event lookup maps
    const polyById = new Map<string, UnifiedEvent>();
    const kalshiById = new Map<string, UnifiedEvent>();

    for (const event of polymarketEvents) {
      polyById.set(event.id, event);
    }
    for (const event of kalshiEvents) {
      kalshiById.set(event.id, event);
    }

    // Build blocking index and find candidate pairs
    const blockingIndex = buildBlockingIndex(polymarketEvents, kalshiEvents);
    const candidatePairStrings = findCandidatePairs(blockingIndex);

    // Calculate all candidates
    const candidates: MatchCandidate[] = [];

    for (const pairString of candidatePairStrings) {
      const pair = parsePairString(pairString);

      // Skip rejected pairs
      if (this.cache!.isRejected(pair.polymarketEventId, pair.kalshiEventId)) {
        continue;
      }

      // Get events
      const polyEvent = polyById.get(pair.polymarketEventId);
      const kalshiEvent = kalshiById.get(pair.kalshiEventId);

      if (!polyEvent || !kalshiEvent) continue;

      // Calculate similarity
      const signals = calculateSimilaritySignals(polyEvent, kalshiEvent);
      const score = combineSignals(signals, this.config.weights, polyEvent.title, kalshiEvent.title);

      // Only keep candidates above minimum threshold
      if (score >= this.config.minCandidateThreshold) {
        candidates.push({
          polymarketEvent: polyEvent,
          kalshiEvent: kalshiEvent,
          score,
          signals,
        });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Split into confirmed and uncertain
    const confirmed = candidates.filter(c => c.score >= this.config.minMatchThreshold);
    const uncertain = candidates.filter(
      c => c.score >= this.config.minCandidateThreshold &&
           c.score < this.config.minMatchThreshold
    );

    // Calculate stats
    const blockingStats = calculateBlockingStats(
      polymarketEvents.length,
      kalshiEvents.length,
      candidatePairStrings.size
    );

    const stats: MatchingStats = {
      totalPotentialComparisons: blockingStats.totalPotential,
      actualComparisons: blockingStats.actualComparisons,
      blockingReduction: parseFloat(blockingStats.reductionPercent),
      durationMs: Date.now() - startTime,
      polymarketEventCount: polymarketEvents.length,
      kalshiEventCount: kalshiEvents.length,
    };

    return {
      candidates,
      confirmed,
      uncertain,
      stats,
    };
  }

  // ============ Filtering Methods ============

  /**
   * Get confirmed matches from candidates (score >= minMatchThreshold).
   */
  getConfirmedMatches(candidates: MatchCandidate[]): MatchCandidate[] {
    return candidates.filter(c => c.score >= this.config.minMatchThreshold);
  }

  /**
   * Get uncertain matches from candidates (between thresholds).
   */
  getUncertainMatches(candidates: MatchCandidate[]): MatchCandidate[] {
    return candidates.filter(
      c => c.score >= this.config.minCandidateThreshold &&
           c.score < this.config.minMatchThreshold
    );
  }

  // ============ Manual Override Methods ============

  /**
   * Manually confirm a match between two events.
   */
  async confirmMatch(
    polymarketEventId: string,
    kalshiEventId: string,
    confidence?: number
  ): Promise<void> {
    this.ensureInitialized();
    this.cache!.addEventMatch(
      polymarketEventId,
      kalshiEventId,
      confidence ?? this.config.minMatchThreshold,
      'manual'
    );
  }

  /**
   * Reject a pair so it won't be matched in the future.
   */
  async rejectPair(
    polymarketEventId: string,
    kalshiEventId: string,
    reason?: string
  ): Promise<void> {
    this.ensureInitialized();
    this.cache!.addRejection(polymarketEventId, kalshiEventId, reason);
  }

  /**
   * Un-reject a pair.
   */
  async unrejectPair(
    polymarketEventId: string,
    kalshiEventId: string
  ): Promise<boolean> {
    this.ensureInitialized();
    return this.cache!.removeRejection(polymarketEventId, kalshiEventId);
  }

  // ============ Cache Methods ============

  /**
   * Save the cache to disk.
   */
  async saveCache(): Promise<void> {
    this.ensureInitialized();
    await this.cache!.save();
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): {
    eventMatches: number;
    marketMatches: number;
    rejectedPairs: number;
    lastUpdated: string;
  } | null {
    if (!this.cache) return null;
    return this.cache.getStats();
  }

  /**
   * Auto-save confirmed matches to cache.
   *
   * @param confirmed Confirmed match candidates to save
   */
  async saveConfirmedMatches(confirmed: MatchCandidate[]): Promise<number> {
    this.ensureInitialized();

    let saved = 0;
    for (const candidate of confirmed) {
      // Only save if not already in cache
      if (!this.cache!.hasMatch(
        candidate.polymarketEvent.id,
        candidate.kalshiEvent.id
      )) {
        this.cache!.addEventMatch(
          candidate.polymarketEvent.id,
          candidate.kalshiEvent.id,
          candidate.score,
          'auto'
        );
        saved++;
      }
    }

    await this.saveCache();
    return saved;
  }

  // ============ Configuration ============

  /**
   * Update matcher configuration.
   */
  setConfig(config: Partial<MatcherConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): MatcherConfig {
    return { ...this.config };
  }
}

// ============ Factory Function ============

/**
 * Create and initialize an event matcher.
 *
 * @param config Optional configuration overrides
 * @returns Initialized event matcher
 */
export async function createEventMatcher(
  config: Partial<MatcherConfig> = {}
): Promise<EventMatcher> {
  const matcher = new EventMatcher(config);
  await matcher.initialize();
  return matcher;
}

// ============ Quick Match Function ============

/**
 * Quick match function for one-off matching without managing state.
 *
 * @param polymarketEvents Polymarket events
 * @param kalshiEvents Kalshi events
 * @param config Optional configuration
 * @returns Matching result
 */
export async function quickMatch(
  polymarketEvents: UnifiedEvent[],
  kalshiEvents: UnifiedEvent[],
  config: Partial<MatcherConfig> = {}
): Promise<MatchingResult> {
  const matcher = await createEventMatcher(config);
  return matcher.findMatches(polymarketEvents, kalshiEvents);
}

export default EventMatcher;
