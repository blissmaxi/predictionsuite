/**
 * Opportunity Processor
 *
 * Transforms scan results into API response format.
 */
import { runScan, getCachedResult, } from '../services/scanner.service.js';
// ============ Transform Functions ============
function generateOpportunityId(opp) {
    const { pair } = opp.opportunity;
    const entity = pair.matchedEntity.toLowerCase().replace(/\s+/g, '-');
    const event = (pair.eventName || 'unknown').toLowerCase().replace(/\s+/g, '-');
    return `${event}-${entity}`.slice(0, 64);
}
function getLiquidityStatus(opp) {
    if (!opp.liquidity) {
        return { status: 'not_analyzed', limitedBy: null };
    }
    const { limitedBy, maxProfit } = opp.liquidity;
    if (limitedBy === 'no_liquidity') {
        return { status: 'no_liquidity', limitedBy };
    }
    if (limitedBy === 'spread_closed') {
        return { status: 'spread_closed', limitedBy };
    }
    if (maxProfit > 0) {
        return { status: 'available', limitedBy };
    }
    return { status: 'no_liquidity', limitedBy };
}
function transformOpportunity(opp, scannedAt) {
    const { opportunity, liquidity } = opp;
    const { pair, type, profitPct } = opportunity;
    return {
        id: generateOpportunityId(opp),
        eventName: pair.eventName || 'Unknown Event',
        marketName: pair.matchedEntity,
        category: pair.category || 'other',
        imageUrl: pair.kalshi.imageUrl || null,
        type: type === 'guaranteed' ? 'guaranteed' : 'spread',
        spreadPct: profitPct,
        potentialProfit: liquidity?.maxProfit ?? 0,
        maxInvestment: liquidity?.maxInvestment ?? 0,
        timeToResolution: null, // Would need end date from event
        fees: {
            polymarket: 2.0, // Estimate
            kalshi: 1.0, // Estimate
        },
        prices: {
            polymarket: {
                yes: pair.polymarket.yesPrice,
                no: pair.polymarket.noPrice,
            },
            kalshi: {
                yes: pair.kalshi.yesPrice,
                no: pair.kalshi.noPrice,
            },
        },
        liquidity: getLiquidityStatus(opp),
        lastUpdated: scannedAt.toISOString(),
    };
}
// ============ Processor Functions ============
export async function getOpportunities(forceRefresh = false) {
    const result = forceRefresh ? await runScan(true) : await runScan();
    const opportunities = result.opportunities.map((opp) => transformOpportunity(opp, result.scannedAt));
    // Sort by spread percentage descending
    opportunities.sort((a, b) => b.spreadPct - a.spreadPct);
    return {
        opportunities,
        meta: {
            totalCount: opportunities.length,
            scannedAt: result.scannedAt.toISOString(),
        },
    };
}
export function getOpportunitiesCached() {
    const result = getCachedResult();
    if (!result)
        return null;
    const opportunities = result.opportunities.map((opp) => transformOpportunity(opp, result.scannedAt));
    opportunities.sort((a, b) => b.spreadPct - a.spreadPct);
    return {
        opportunities,
        meta: {
            totalCount: opportunities.length,
            scannedAt: result.scannedAt.toISOString(),
        },
    };
}
