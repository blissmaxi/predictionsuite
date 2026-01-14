/**
 * Liquidity Analyzer
 *
 * Analyzes order book depth to determine the maximum executable size
 * of an arbitrage opportunity before the spread disappears.
 *
 * Key insight: The "spread" shown from last trade prices may differ
 * significantly from the actual executable spread in the order book.
 */
import { DISPLAY } from '../config/api.js';
// ============ Main Analysis ============
/**
 * Analyze the executable liquidity of an arbitrage opportunity.
 *
 * Strategy: Buy Polymarket YES + Buy Kalshi NO
 * - Walks through both order books simultaneously
 * - Consumes liquidity at each price level
 * - Stops when cost >= $1 (no more profit)
 *
 * @param opportunity - The arbitrage opportunity to analyze
 * @param polyOrderBook - Polymarket order book
 * @param kalshiOrderBook - Kalshi order book
 * @param options - Fee and threshold configuration
 */
export function analyzeLiquidity(opportunity, polyOrderBook, kalshiOrderBook, options = {}) {
    const { polymarketFee = 0, kalshiFee = 0, minProfitPct = 0 } = options;
    const totalFees = polymarketFee + kalshiFee;
    const minProfitThreshold = minProfitPct / 100;
    // Get the relevant order book sides for this strategy
    const polyAsks = [...polyOrderBook.yesAsks];
    const kalshiAsks = [...kalshiOrderBook.noAsks];
    // Calculate total available depth
    const polymarketDepth = sumLevels(polyAsks);
    const kalshiDepth = sumLevels(kalshiAsks);
    // Early return: no liquidity
    if (polyAsks.length === 0 || kalshiAsks.length === 0) {
        return createNoLiquidityResult(opportunity, polymarketDepth, kalshiDepth);
    }
    // Check if spread is already closed at best prices
    const bestPolyAsk = polyAsks[0].price;
    const bestKalshiAsk = kalshiAsks[0].price;
    const orderBookCost = bestPolyAsk + bestKalshiAsk;
    const initialProfit = 1 - orderBookCost - totalFees;
    if (initialProfit <= minProfitThreshold) {
        return createSpreadClosedResult(opportunity, polymarketDepth, kalshiDepth, bestPolyAsk, bestKalshiAsk, orderBookCost);
    }
    // Walk through order books and accumulate profitable trades
    const { levels, totalContracts, totalCost, totalProfit, limitedBy } = walkOrderBooks(polyAsks, kalshiAsks, totalFees, minProfitThreshold);
    return {
        opportunity,
        maxContracts: totalContracts,
        maxInvestment: totalCost,
        maxProfit: totalProfit,
        avgProfitPct: totalContracts > 0 ? (totalProfit / totalCost) * 100 : 0,
        levels,
        limitedBy,
        polymarketDepth,
        kalshiDepth,
        bestPolyAsk,
        bestKalshiAsk,
        orderBookCost,
    };
}
/**
 * Walk through both order books, matching liquidity at each level.
 */
function walkOrderBooks(polyAsks, kalshiAsks, totalFees, minProfitThreshold) {
    const levels = [];
    let totalContracts = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let polyIdx = 0;
    let kalshiIdx = 0;
    let polyRemaining = polyAsks[0]?.size || 0;
    let kalshiRemaining = kalshiAsks[0]?.size || 0;
    while (polyIdx < polyAsks.length && kalshiIdx < kalshiAsks.length) {
        const polyLevel = polyAsks[polyIdx];
        const kalshiLevel = kalshiAsks[kalshiIdx];
        const costPerContract = polyLevel.price + kalshiLevel.price;
        const profitPerContract = 1 - costPerContract - totalFees;
        // Stop if no longer profitable
        if (profitPerContract <= minProfitThreshold) {
            break;
        }
        // Take the minimum available from both sides
        const available = Math.min(polyRemaining, kalshiRemaining);
        if (available > 0) {
            totalContracts += available;
            totalCost += available * costPerContract;
            totalProfit += available * profitPerContract;
            levels.push({
                contracts: available,
                polyPrice: polyLevel.price,
                kalshiPrice: kalshiLevel.price,
                costPerContract,
                profitPerContract,
                cumulativeContracts: totalContracts,
                cumulativeCost: totalCost,
                cumulativeProfit: totalProfit,
            });
            polyRemaining -= available;
            kalshiRemaining -= available;
        }
        // Advance to next level if current is exhausted
        if (polyRemaining <= 0) {
            polyIdx++;
            polyRemaining = polyAsks[polyIdx]?.size || 0;
        }
        if (kalshiRemaining <= 0) {
            kalshiIdx++;
            kalshiRemaining = kalshiAsks[kalshiIdx]?.size || 0;
        }
    }
    const limitedBy = determineLimitingFactor(totalContracts, polyIdx, kalshiIdx, polyAsks.length, kalshiAsks.length);
    return { levels, totalContracts, totalCost, totalProfit, limitedBy };
}
/**
 * Determine what factor limited the arbitrage opportunity.
 */
function determineLimitingFactor(totalContracts, polyIdx, kalshiIdx, polyLength, kalshiLength) {
    if (totalContracts === 0) {
        return 'no_liquidity';
    }
    if (polyIdx >= polyLength && kalshiIdx < kalshiLength) {
        return 'polymarket_liquidity';
    }
    if (kalshiIdx >= kalshiLength && polyIdx < polyLength) {
        return 'kalshi_liquidity';
    }
    return 'spread_exhausted';
}
// ============ Result Builders ============
function createNoLiquidityResult(opportunity, polymarketDepth, kalshiDepth) {
    return {
        opportunity,
        maxContracts: 0,
        maxInvestment: 0,
        maxProfit: 0,
        avgProfitPct: 0,
        levels: [],
        limitedBy: 'no_liquidity',
        polymarketDepth,
        kalshiDepth,
    };
}
function createSpreadClosedResult(opportunity, polymarketDepth, kalshiDepth, bestPolyAsk, bestKalshiAsk, orderBookCost) {
    return {
        opportunity,
        maxContracts: 0,
        maxInvestment: 0,
        maxProfit: 0,
        avgProfitPct: 0,
        levels: [],
        limitedBy: 'spread_closed',
        polymarketDepth,
        kalshiDepth,
        bestPolyAsk,
        bestKalshiAsk,
        orderBookCost,
    };
}
// ============ Formatting ============
/**
 * Format liquidity analysis for console display.
 */
export function formatLiquidityAnalysis(analysis) {
    if (analysis.maxContracts === 0) {
        return formatNoLiquidityMessage(analysis);
    }
    return formatProfitableAnalysis(analysis);
}
function formatNoLiquidityMessage(analysis) {
    const lines = [];
    switch (analysis.limitedBy) {
        case 'spread_closed':
            lines.push('  Spread closed at order book prices');
            if (analysis.bestPolyAsk !== undefined && analysis.bestKalshiAsk !== undefined) {
                lines.push(`    Poly YES ask: ${formatCents(analysis.bestPolyAsk)} + ` +
                    `Kalshi NO ask: ${formatCents(analysis.bestKalshiAsk)} = ` +
                    `${formatCents(analysis.orderBookCost)}`);
                const lossPct = (analysis.orderBookCost - 1) * 100;
                lines.push(`    Execution would lose ${lossPct.toFixed(1)}%`);
            }
            lines.push('    (Last trade prices showed profit, but order book has moved)');
            break;
        case 'no_liquidity':
            lines.push('  No liquidity (empty order book)');
            lines.push(`    Polymarket depth: ${analysis.polymarketDepth.toFixed(0)} contracts`);
            lines.push(`    Kalshi depth: ${analysis.kalshiDepth.toFixed(0)} contracts`);
            break;
        default:
            lines.push('  No executable arbitrage');
    }
    return lines.join('\n');
}
function formatProfitableAnalysis(analysis) {
    const lines = [
        `  Max Contracts: ${analysis.maxContracts.toLocaleString()}`,
        `  Max Investment: $${analysis.maxInvestment.toFixed(2)}`,
        `  Max Profit: $${analysis.maxProfit.toFixed(2)} (${analysis.avgProfitPct.toFixed(2)}%)`,
        `  Limited by: ${formatLimitingFactor(analysis.limitedBy)}`,
    ];
    // Add price level breakdown
    const levelCount = analysis.levels.length;
    if (levelCount > 0 && levelCount <= DISPLAY.PRICE_LEVELS_FULL) {
        lines.push('', '  Price Levels:');
        for (const level of analysis.levels) {
            lines.push(formatLevelLine(level));
        }
    }
    else if (levelCount > DISPLAY.PRICE_LEVELS_FULL) {
        lines.push('', `  Price Levels: ${levelCount} levels (showing first ${DISPLAY.PRICE_LEVELS_PREVIEW})`);
        for (const level of analysis.levels.slice(0, DISPLAY.PRICE_LEVELS_PREVIEW)) {
            lines.push(formatLevelLine(level));
        }
    }
    return lines.join('\n');
}
function formatLevelLine(level) {
    const profitPct = (level.profitPerContract * 100).toFixed(1);
    return (`    ${level.contracts} @ ` +
        `Poly ${formatCents(level.polyPrice)} + ` +
        `Kalshi ${formatCents(level.kalshiPrice)} = ` +
        `${profitPct}% profit`);
}
function formatLimitingFactor(factor) {
    const descriptions = {
        polymarket_liquidity: 'Polymarket liquidity',
        kalshi_liquidity: 'Kalshi liquidity',
        spread_exhausted: 'Spread exhausted (prices converged)',
        spread_closed: 'Spread closed (order book prices unfavorable)',
        no_liquidity: 'No liquidity (empty order book)',
    };
    return descriptions[factor];
}
function formatCents(price) {
    return `${(price * 100).toFixed(1)}¢`;
}
/**
 * Summarize multiple liquidity analyses.
 */
export function summarizeLiquidity(analyses) {
    const withLiquidity = analyses.filter((a) => a.maxContracts > 0);
    const totalDeployableCapital = withLiquidity.reduce((sum, a) => sum + a.maxInvestment, 0);
    const totalPotentialProfit = withLiquidity.reduce((sum, a) => sum + a.maxProfit, 0);
    return {
        totalOpportunities: analyses.length,
        withLiquidity: withLiquidity.length,
        totalDeployableCapital,
        totalPotentialProfit,
        avgProfitPct: totalDeployableCapital > 0
            ? (totalPotentialProfit / totalDeployableCapital) * 100
            : 0,
        over100: withLiquidity.filter((a) => a.maxInvestment >= 100).length,
        over1000: withLiquidity.filter((a) => a.maxInvestment >= 1000).length,
    };
}
// ============ Helpers ============
function sumLevels(levels) {
    return levels.reduce((sum, l) => sum + l.size, 0);
}
