/**
 * Test Script for Platform Connectors
 *
 * Fetches data from both Polymarket and Kalshi connectors
 * and verifies the normalized output format.
 */
import { fetchPolymarketEvents } from '../connectors/polymarket-connector.js';
import { fetchKalshiEvents } from '../connectors/kalshi-connector.js';
// ============ Display Helpers ============
function printDivider(title) {
    console.log('\n' + '='.repeat(70));
    console.log(` ${title}`);
    console.log('='.repeat(70));
}
function printMarket(market, indent = '  ') {
    console.log(`${indent}[Market] ${market.question.slice(0, 60)}${market.question.length > 60 ? '...' : ''}`);
    console.log(`${indent}  ID: ${market.id}`);
    console.log(`${indent}  YES: $${market.yesPrice.toFixed(3)} (bid: $${market.yesBid.toFixed(3)}, ask: $${market.yesAsk.toFixed(3)})`);
    console.log(`${indent}  NO:  $${market.noPrice.toFixed(3)} (bid: $${market.noBid.toFixed(3)}, ask: $${market.noAsk.toFixed(3)})`);
    console.log(`${indent}  Sum: $${(market.yesPrice + market.noPrice).toFixed(3)} (should be ~1.0)`);
    console.log(`${indent}  Volume: $${market.volume.toLocaleString()} | Liquidity: $${market.liquidity.toLocaleString()}`);
    console.log(`${indent}  End: ${market.endDate}`);
    console.log(`${indent}  URL: ${market.sourceUrl}`);
}
function printEvent(event) {
    console.log(`\n[Event] ${event.title}`);
    console.log(`  Platform: ${event.platform}`);
    console.log(`  ID: ${event.id}`);
    console.log(`  Category: ${event.category || 'N/A'}`);
    console.log(`  Markets: ${event.markets.length}`);
    console.log(`  URL: ${event.sourceUrl || 'N/A'}`);
    // Show first 3 markets
    for (const market of event.markets.slice(0, 3)) {
        console.log('');
        printMarket(market, '    ');
    }
    if (event.markets.length > 3) {
        console.log(`\n    ... and ${event.markets.length - 3} more markets`);
    }
}
// ============ Validation ============
function validateMarket(market) {
    const issues = [];
    // Check prices are in valid range
    if (market.yesPrice <= 0 || market.yesPrice >= 1) {
        issues.push(`Invalid YES price: ${market.yesPrice}`);
    }
    if (market.noPrice <= 0 || market.noPrice >= 1) {
        issues.push(`Invalid NO price: ${market.noPrice}`);
    }
    // Check prices sum to approximately 1
    const sum = market.yesPrice + market.noPrice;
    if (sum < 0.9 || sum > 1.1) {
        issues.push(`Price sum out of range: ${sum.toFixed(3)}`);
    }
    // Check required fields
    if (!market.question)
        issues.push('Missing question');
    if (!market.eventId)
        issues.push('Missing eventId');
    if (!market.sourceUrl)
        issues.push('Missing sourceUrl');
    return issues;
}
// ============ Main Test ============
async function main() {
    console.log('Platform Connector Test');
    console.log('=======================\n');
    let totalMarkets = 0;
    let validMarkets = 0;
    let invalidMarkets = 0;
    // ============ Test Polymarket ============
    printDivider('POLYMARKET CONNECTOR');
    try {
        console.log('Fetching Polymarket events (limit: 5)...');
        const polyResult = await fetchPolymarketEvents(5);
        console.log(`\nFetched: ${polyResult.data.length} events`);
        console.log(`Errors: ${polyResult.errors.length}`);
        console.log(`Fetched at: ${polyResult.fetchedAt}`);
        // Show sample events
        for (const event of polyResult.data.slice(0, 2)) {
            printEvent(event);
            // Validate markets
            for (const market of event.markets) {
                totalMarkets++;
                const issues = validateMarket(market);
                if (issues.length === 0) {
                    validMarkets++;
                }
                else {
                    invalidMarkets++;
                    console.log(`    [!] Validation issues for ${market.id}:`, issues);
                }
            }
        }
        // Show errors if any
        if (polyResult.errors.length > 0) {
            console.log('\nSkipped items:');
            for (const error of polyResult.errors.slice(0, 5)) {
                console.log(`  - ${error}`);
            }
            if (polyResult.errors.length > 5) {
                console.log(`  ... and ${polyResult.errors.length - 5} more`);
            }
        }
    }
    catch (error) {
        console.error('Polymarket test failed:', error);
    }
    // ============ Test Kalshi ============
    printDivider('KALSHI CONNECTOR');
    try {
        console.log('Fetching Kalshi events (limit: 5)...');
        const kalshiResult = await fetchKalshiEvents(5);
        console.log(`\nFetched: ${kalshiResult.data.length} events`);
        console.log(`Errors: ${kalshiResult.errors.length}`);
        console.log(`Fetched at: ${kalshiResult.fetchedAt}`);
        // Show sample events
        for (const event of kalshiResult.data.slice(0, 2)) {
            printEvent(event);
            // Validate markets
            for (const market of event.markets) {
                totalMarkets++;
                const issues = validateMarket(market);
                if (issues.length === 0) {
                    validMarkets++;
                }
                else {
                    invalidMarkets++;
                    console.log(`    [!] Validation issues for ${market.id}:`, issues);
                }
            }
        }
        // Show errors if any
        if (kalshiResult.errors.length > 0) {
            console.log('\nSkipped items:');
            for (const error of kalshiResult.errors.slice(0, 5)) {
                console.log(`  - ${error}`);
            }
            if (kalshiResult.errors.length > 5) {
                console.log(`  ... and ${kalshiResult.errors.length - 5} more`);
            }
        }
    }
    catch (error) {
        console.error('Kalshi test failed:', error);
    }
    // ============ Summary ============
    printDivider('VALIDATION SUMMARY');
    console.log(`\nTotal markets validated: ${totalMarkets}`);
    console.log(`Valid: ${validMarkets} (${((validMarkets / totalMarkets) * 100).toFixed(1)}%)`);
    console.log(`Invalid: ${invalidMarkets} (${((invalidMarkets / totalMarkets) * 100).toFixed(1)}%)`);
    if (invalidMarkets === 0) {
        console.log('\n✓ All markets passed validation!');
    }
    else {
        console.log(`\n⚠ ${invalidMarkets} markets have validation issues`);
    }
}
main().catch(console.error);
