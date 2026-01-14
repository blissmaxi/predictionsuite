/**
 * Catalog Matcher
 *
 * Reads market mappings from config/market-mappings.json and provides
 * functions to match markets between Polymarket and Kalshi.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// ============ Month Helpers ============
const MONTHS_FULL = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];
const MONTHS_SHORT = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
];
// ============ Config Loading ============
let cachedMappings = null;
/**
 * Load market mappings from config file.
 */
export function loadMappings() {
    if (cachedMappings)
        return cachedMappings;
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = join(__dirname, '../../config/market-mappings.json');
    const content = readFileSync(configPath, 'utf-8');
    cachedMappings = JSON.parse(content);
    return cachedMappings;
}
/**
 * Clear cached mappings (useful for testing).
 */
export function clearCache() {
    cachedMappings = null;
}
// ============ Static Matching ============
/**
 * Find a static mapping by Polymarket slug.
 */
export function findStaticByPolymarket(slug) {
    const mappings = loadMappings();
    const normalized = slug.toLowerCase();
    for (const mapping of mappings.static) {
        if (mapping.polymarket.toLowerCase() === normalized) {
            return mapping;
        }
    }
    return null;
}
/**
 * Find a static mapping by Kalshi ticker.
 */
export function findStaticByKalshi(ticker) {
    const mappings = loadMappings();
    const normalized = ticker.toUpperCase();
    for (const mapping of mappings.static) {
        if (mapping.kalshi.toUpperCase() === normalized) {
            return mapping;
        }
    }
    return null;
}
// ============ Dynamic Pattern Matching ============
/**
 * Generate Polymarket slug from dynamic pattern and date.
 */
function generatePolymarketSlug(pattern, date) {
    const year = date.getFullYear().toString();
    const month = MONTHS_FULL[date.getMonth()];
    const day = date.getDate().toString();
    return pattern
        .replace('{year}', year)
        .replace('{month}', month)
        .replace('{day}', day);
}
/**
 * Generate Kalshi ticker from dynamic pattern and date.
 */
function generateKalshiTicker(pattern, date) {
    const yy = date.getFullYear().toString().slice(-2);
    const mon = MONTHS_SHORT[date.getMonth()];
    const dd = date.getDate().toString().padStart(2, '0');
    return pattern
        .replace('{yy}', yy)
        .replace('{MON}', mon)
        .replace('{dd}', dd);
}
/**
 * Try to match a Polymarket slug against dynamic patterns.
 */
export function matchDynamicPolymarket(slug) {
    const mappings = loadMappings();
    for (const dynamic of mappings.dynamic) {
        // Build regex from pattern - escape special chars and replace placeholders
        let regexPattern = dynamic.polymarket.pattern
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
            .replace('\\{year\\}', '(\\d{4})')
            .replace('\\{month\\}', '(\\w+)')
            .replace('\\{day\\}', '(\\d+)');
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        const match = slug.match(regex);
        if (match) {
            let date;
            if (dynamic.frequency === 'yearly') {
                // For yearly patterns, extract year from slug
                const yearMatch = slug.match(/(\d{4})/);
                const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();
                date = new Date(year, 0, 1); // Jan 1 of that year
            }
            else if (dynamic.frequency === 'daily') {
                // Extract month and day
                const monthStr = match[1]?.toLowerCase();
                const monthIdx = MONTHS_FULL.indexOf(monthStr);
                const day = parseInt(match[2], 10);
                if (monthIdx < 0 || isNaN(day))
                    continue;
                const year = new Date().getFullYear();
                date = new Date(year, monthIdx, day);
            }
            else {
                // Monthly/quarterly - extract month
                const monthStr = match[1]?.toLowerCase();
                const monthIdx = MONTHS_FULL.indexOf(monthStr);
                if (monthIdx < 0)
                    continue;
                const year = new Date().getFullYear();
                date = new Date(year, monthIdx, 1);
            }
            return {
                name: dynamic.name,
                category: dynamic.category,
                type: 'dynamic',
                polymarketSlug: slug,
                kalshiTicker: generateKalshiTicker(dynamic.kalshi.pattern, date),
                kalshiSeries: dynamic.kalshi.series,
                date,
            };
        }
    }
    return null;
}
/**
 * Try to match a Kalshi ticker against dynamic patterns.
 */
export function matchDynamicKalshi(ticker) {
    const mappings = loadMappings();
    const upperTicker = ticker.toUpperCase();
    for (const dynamic of mappings.dynamic) {
        // Build regex from pattern
        const regexPattern = dynamic.kalshi.pattern
            .replace('{yy}', '(\\d{2})')
            .replace('{MON}', '([A-Z]{3})')
            .replace('{dd}', '(\\d{2})');
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        const match = upperTicker.match(regex);
        if (match) {
            // Extract date from match
            const year = 2000 + parseInt(match[1], 10);
            const monStr = match[2].toUpperCase();
            const monthIdx = MONTHS_SHORT.indexOf(monStr);
            const day = parseInt(match[3], 10);
            if (monthIdx >= 0 && !isNaN(day)) {
                const date = new Date(year, monthIdx, day);
                return {
                    name: dynamic.name,
                    category: dynamic.category,
                    type: 'dynamic',
                    polymarketSlug: generatePolymarketSlug(dynamic.polymarket.pattern, date),
                    kalshiTicker: ticker,
                    date,
                };
            }
        }
    }
    return null;
}
// ============ Main Matching Functions ============
/**
 * Find a match for an identifier from either platform.
 *
 * @param identifier The slug (Polymarket) or ticker (Kalshi)
 * @param platform Which platform the identifier is from
 * @returns Match result with counterpart, or null if no match
 */
export function findMatch(identifier, platform) {
    if (platform === 'polymarket') {
        // Try static first
        const staticMatch = findStaticByPolymarket(identifier);
        if (staticMatch) {
            return {
                name: staticMatch.name,
                category: staticMatch.category,
                type: 'static',
                polymarketSlug: identifier,
                kalshiTicker: staticMatch.kalshi,
            };
        }
        // Try dynamic patterns
        return matchDynamicPolymarket(identifier);
    }
    else {
        // Try static first
        const staticMatch = findStaticByKalshi(identifier);
        if (staticMatch) {
            return {
                name: staticMatch.name,
                category: staticMatch.category,
                type: 'static',
                polymarketSlug: staticMatch.polymarket,
                kalshiTicker: identifier,
            };
        }
        // Try dynamic patterns
        return matchDynamicKalshi(identifier);
    }
}
/**
 * Generate all dynamic matches for a given date.
 *
 * @param date The date to generate matches for
 * @param category Optional category filter
 * @returns Array of match results
 */
export function generateDynamicMatches(date, category) {
    const mappings = loadMappings();
    const results = [];
    for (const dynamic of mappings.dynamic) {
        // Filter by category if specified
        if (category && dynamic.category !== category)
            continue;
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
export function generateYearlyMatches(year, category) {
    const mappings = loadMappings();
    const results = [];
    const targetYear = year || new Date().getFullYear();
    const date = new Date(targetYear, 0, 1);
    for (const dynamic of mappings.dynamic) {
        // Filter by category if specified
        if (category && dynamic.category !== category)
            continue;
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
/**
 * Get all static mappings.
 */
export function getAllStaticMappings() {
    const mappings = loadMappings();
    return mappings.static.map(m => ({
        name: m.name,
        category: m.category,
        type: 'static',
        polymarketSlug: m.polymarket,
        kalshiTicker: m.kalshi,
        kalshiSeries: m.kalshiSeries,
    }));
}
/**
 * Get all dynamic mapping configurations.
 */
export function getAllDynamicConfigs() {
    return loadMappings().dynamic;
}
