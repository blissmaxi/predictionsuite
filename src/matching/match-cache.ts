/**
 * Match Cache
 *
 * Persistence layer for confirmed matches and rejected pairs.
 * Uses JSON file storage for simplicity.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type {
  MatchCacheData,
  EventMatch,
  MarketMatch,
  RejectedPair,
} from './types.js';

// ============ Constants ============

const CACHE_VERSION = 1;

/**
 * Default empty cache structure.
 */
function createEmptyCache(): MatchCacheData {
  return {
    version: CACHE_VERSION,
    lastUpdated: new Date().toISOString(),
    eventMatches: [],
    marketMatches: [],
    rejectedPairs: [],
  };
}

// ============ MatchCache Class ============

/**
 * Cache for persisting matches and rejections.
 */
export class MatchCache {
  private cachePath: string;
  private data: MatchCacheData;
  private dirty: boolean = false;

  // In-memory indexes for fast lookups
  private eventMatchIndex: Map<string, EventMatch> = new Map();
  private rejectionIndex: Set<string> = new Set();

  constructor(cachePath: string) {
    this.cachePath = cachePath;
    this.data = createEmptyCache();
  }

  // ============ File Operations ============

  /**
   * Load cache from disk.
   * Creates empty cache if file doesn't exist.
   */
  async load(): Promise<void> {
    try {
      const content = await readFile(this.cachePath, 'utf-8');
      this.data = JSON.parse(content) as MatchCacheData;

      // Migrate if needed
      if (this.data.version < CACHE_VERSION) {
        this.migrate();
      }

      // Build indexes
      this.buildIndexes();
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist - start fresh
        this.data = createEmptyCache();
        this.buildIndexes();
      } else {
        throw error;
      }
    }
  }

  /**
   * Save cache to disk.
   * Only writes if there are changes.
   */
  async save(): Promise<void> {
    if (!this.dirty) return;

    this.data.lastUpdated = new Date().toISOString();

    // Ensure directory exists
    const dir = dirname(this.cachePath);
    await mkdir(dir, { recursive: true });

    // Write with pretty formatting
    const content = JSON.stringify(this.data, null, 2);
    await writeFile(this.cachePath, content, 'utf-8');

    this.dirty = false;
  }

  /**
   * Migrate cache to current version.
   */
  private migrate(): void {
    // Future migrations go here
    this.data.version = CACHE_VERSION;
    this.dirty = true;
  }

  /**
   * Build in-memory indexes from loaded data.
   */
  private buildIndexes(): void {
    this.eventMatchIndex.clear();
    this.rejectionIndex.clear();

    // Index event matches by pair key
    for (const match of this.data.eventMatches) {
      const key = this.makePairKey(match.polymarketEventId, match.kalshiEventId);
      this.eventMatchIndex.set(key, match);
    }

    // Index rejections
    for (const rejection of this.data.rejectedPairs) {
      const key = this.makePairKey(rejection.polymarketEventId, rejection.kalshiEventId);
      this.rejectionIndex.add(key);
    }
  }

  // ============ Key Generation ============

  /**
   * Create a consistent key for a pair of event IDs.
   */
  private makePairKey(polymarketEventId: string, kalshiEventId: string): string {
    return `${polymarketEventId}||${kalshiEventId}`;
  }

  // ============ Lookup Methods ============

  /**
   * Check if a pair has been rejected.
   */
  isRejected(polymarketEventId: string, kalshiEventId: string): boolean {
    const key = this.makePairKey(polymarketEventId, kalshiEventId);
    return this.rejectionIndex.has(key);
  }

  /**
   * Check if a pair has a confirmed match.
   */
  hasMatch(polymarketEventId: string, kalshiEventId: string): boolean {
    const key = this.makePairKey(polymarketEventId, kalshiEventId);
    return this.eventMatchIndex.has(key);
  }

  /**
   * Get a confirmed match if it exists.
   */
  getMatch(polymarketEventId: string, kalshiEventId: string): EventMatch | undefined {
    const key = this.makePairKey(polymarketEventId, kalshiEventId);
    return this.eventMatchIndex.get(key);
  }

  /**
   * Get all confirmed event matches.
   */
  getAllEventMatches(): EventMatch[] {
    return [...this.data.eventMatches];
  }

  /**
   * Get all market matches.
   */
  getAllMarketMatches(): MarketMatch[] {
    return [...this.data.marketMatches];
  }

  /**
   * Get all rejected pairs.
   */
  getAllRejections(): RejectedPair[] {
    return [...this.data.rejectedPairs];
  }

  // ============ Modification Methods ============

  /**
   * Add a confirmed event match.
   */
  addEventMatch(
    polymarketEventId: string,
    kalshiEventId: string,
    confidence: number,
    source: 'auto' | 'manual' = 'auto'
  ): void {
    const key = this.makePairKey(polymarketEventId, kalshiEventId);

    // Remove from rejections if present
    if (this.rejectionIndex.has(key)) {
      this.rejectionIndex.delete(key);
      this.data.rejectedPairs = this.data.rejectedPairs.filter(
        r => this.makePairKey(r.polymarketEventId, r.kalshiEventId) !== key
      );
    }

    // Add or update match
    const match: EventMatch = {
      polymarketEventId,
      kalshiEventId,
      confidence,
      source,
      createdAt: new Date().toISOString(),
    };

    if (this.eventMatchIndex.has(key)) {
      // Update existing
      const index = this.data.eventMatches.findIndex(
        m => this.makePairKey(m.polymarketEventId, m.kalshiEventId) === key
      );
      if (index >= 0) {
        this.data.eventMatches[index] = match;
      }
    } else {
      // Add new
      this.data.eventMatches.push(match);
    }

    this.eventMatchIndex.set(key, match);
    this.dirty = true;
  }

  /**
   * Add a market match.
   */
  addMarketMatch(
    polymarketMarketId: string,
    kalshiMarketId: string,
    confidence: number,
    source: 'auto' | 'manual' = 'auto',
    eventMatchId?: string
  ): void {
    const match: MarketMatch = {
      polymarketMarketId,
      kalshiMarketId,
      eventMatchId,
      confidence,
      source,
      createdAt: new Date().toISOString(),
    };

    this.data.marketMatches.push(match);
    this.dirty = true;
  }

  /**
   * Add a rejected pair.
   */
  addRejection(
    polymarketEventId: string,
    kalshiEventId: string,
    reason?: string
  ): void {
    const key = this.makePairKey(polymarketEventId, kalshiEventId);

    // Remove from matches if present
    if (this.eventMatchIndex.has(key)) {
      this.eventMatchIndex.delete(key);
      this.data.eventMatches = this.data.eventMatches.filter(
        m => this.makePairKey(m.polymarketEventId, m.kalshiEventId) !== key
      );
    }

    // Add rejection if not already present
    if (!this.rejectionIndex.has(key)) {
      const rejection: RejectedPair = {
        polymarketEventId,
        kalshiEventId,
        reason,
        rejectedAt: new Date().toISOString(),
      };

      this.data.rejectedPairs.push(rejection);
      this.rejectionIndex.add(key);
      this.dirty = true;
    }
  }

  /**
   * Remove a rejection (un-reject a pair).
   */
  removeRejection(polymarketEventId: string, kalshiEventId: string): boolean {
    const key = this.makePairKey(polymarketEventId, kalshiEventId);

    if (this.rejectionIndex.has(key)) {
      this.rejectionIndex.delete(key);
      this.data.rejectedPairs = this.data.rejectedPairs.filter(
        r => this.makePairKey(r.polymarketEventId, r.kalshiEventId) !== key
      );
      this.dirty = true;
      return true;
    }

    return false;
  }

  /**
   * Clear all data (for testing).
   */
  clear(): void {
    this.data = createEmptyCache();
    this.buildIndexes();
    this.dirty = true;
  }

  // ============ Statistics ============

  /**
   * Get cache statistics.
   */
  getStats(): {
    eventMatches: number;
    marketMatches: number;
    rejectedPairs: number;
    lastUpdated: string;
  } {
    return {
      eventMatches: this.data.eventMatches.length,
      marketMatches: this.data.marketMatches.length,
      rejectedPairs: this.data.rejectedPairs.length,
      lastUpdated: this.data.lastUpdated,
    };
  }
}

// ============ Factory Function ============

/**
 * Create and load a match cache.
 *
 * @param cachePath Path to cache file
 * @returns Loaded match cache
 */
export async function createMatchCache(cachePath: string): Promise<MatchCache> {
  const cache = new MatchCache(cachePath);
  await cache.load();
  return cache;
}
