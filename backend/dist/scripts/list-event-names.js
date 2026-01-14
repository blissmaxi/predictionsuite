/**
 * List Event Names
 *
 * Simple debug script to list event titles from both platforms.
 */
import { fetchAllPolymarketEvents } from '../connectors/polymarket-connector.js';
import { fetchAllKalshiEvents } from '../connectors/kalshi-connector.js';
const MAX_EVENTS = 1000; // Adjust as needed
async function main() {
    console.log('Fetching events...\n');
    // Fetch from both platforms
    const [polyResult, kalshiResult] = await Promise.all([
        fetchAllPolymarketEvents({ maxEvents: MAX_EVENTS }),
        fetchAllKalshiEvents({ maxEvents: MAX_EVENTS }),
    ]);
    console.log(`Polymarket: ${polyResult.data.length} events`);
    console.log(`Kalshi: ${kalshiResult.data.length} events`);
    // Find common titles (exact matches)
    console.log('\n========== EXACT TITLE MATCHES ==========');
    const polyTitles = new Set(polyResult.data.map(e => e.title.toLowerCase()));
    const kalshiTitles = new Map(kalshiResult.data.map(e => [e.title.toLowerCase(), e.title]));
    let exactMatches = 0;
    for (const [lower, original] of kalshiTitles) {
        if (polyTitles.has(lower)) {
            console.log(`  - "${original}"`);
            exactMatches++;
        }
    }
    console.log(`\nTotal exact matches: ${exactMatches}`);
    // Search for "fed" events specifically
    console.log('\n========== POLYMARKET "FED" EVENTS ==========');
    for (const event of polyResult.data) {
        if (event.title.toLowerCase().includes('fed')) {
            console.log(`  - "${event.title}"`);
        }
    }
    console.log('\n========== KALSHI "FED" EVENTS ==========');
    for (const event of kalshiResult.data) {
        if (event.title.toLowerCase().includes('fed')) {
            console.log(`  - "${event.title}"`);
        }
    }
}
main().catch(console.error);
