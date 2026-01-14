/**
 * Scanner Service
 *
 * Orchestrates the full arbitrage scanning pipeline.
 * Wraps the existing scanner logic for use by the API.
 */
import { EventsApi, Configuration, } from 'kalshi-typescript';
import { loadMappings, generateDynamicMatches, generateYearlyMatches, } from '../../matching/catalog-matcher.js';
import { matchMarketsWithinEvent, } from '../../matching/market-matcher.js';
import { findArbitrageOpportunities, } from '../../arbitrage/calculator.js';
import { fetchPolymarketOrderBook, fetchKalshiOrderBook, } from '../../orderbook/fetcher.js';
import { analyzeLiquidity, } from '../../arbitrage/liquidity-analyzer.js';
import { POLYMARKET, KALSHI, SCANNER } from '../../config/api.js';
import { fetchNbaGameMatches, } from '../../matching/nba-game-matcher.js';
// ============ Configuration ============
const kalshiConfig = new Configuration({ basePath: KALSHI.API_URL });
const kalshiEventsApi = new EventsApi(kalshiConfig);
const CURRENT_YEAR = new Date().getFullYear();
// ============ Cache ============
let cachedResult = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds
// ============ Utility ============
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// ============ Kalshi Image URLs ============
const KALSHI_IMAGE_BASE = 'https://d1lvyva3zy5u58.cloudfront.net/series-images-webp';
const KALSHI_NBA_IMAGE = 'https://kalshi-public-docs.s3.us-east-1.amazonaws.com/override_images/sports/Basketball-NBA-Game.webp';
function getKalshiImageUrl(seriesTicker) {
    // NBA games use a generic basketball image
    if (seriesTicker === 'KXNBAGAME') {
        return KALSHI_NBA_IMAGE;
    }
    // Other series use their series ticker
    return `${KALSHI_IMAGE_BASE}/${seriesTicker}.webp?size=sm`;
}
async function fetchPolymarketEvent(slug) {
    try {
        const response = await fetch(`${POLYMARKET.GAMMA_API_URL}/events?slug=${slug}`);
        const data = await response.json();
        if (data.length === 0)
            return null;
        const event = data[0];
        const markets = (event.markets || []).map((m) => {
            const prices = JSON.parse(m.outcomePrices || '["0","0"]');
            const tokenIds = m.clobTokenIds ? JSON.parse(m.clobTokenIds) : undefined;
            return {
                question: m.question || m.groupItemTitle || 'Unknown',
                yesPrice: parseFloat(prices[0]) || 0,
                volume: m.volumeNum || 0,
                tokenIds,
            };
        });
        return { title: event.title, markets };
    }
    catch {
        return null;
    }
}
async function fetchKalshiEvent(ticker) {
    const series = ticker.replace(/-.*$/, '');
    return fetchKalshiEventBySeries(ticker, series);
}
async function fetchKalshiEventBySeries(ticker, series) {
    try {
        const response = await kalshiEventsApi.getEvents(100, undefined, true, false, 'open', series);
        const events = response.data.events || [];
        const event = events.find((e) => e.event_ticker?.toUpperCase() === ticker.toUpperCase());
        if (!event)
            return null;
        const markets = (event.markets || [])
            .filter((m) => m.status === 'active')
            .map((m) => ({
            question: m.yes_sub_title || m.title || 'Unknown',
            yesPrice: parseFloat(m.last_price_dollars || '0') || 0,
            volume: m.volume || 0,
            ticker: m.ticker,
        }));
        // Construct image URL from series ticker
        const imageUrl = getKalshiImageUrl(series);
        return { title: event.title || ticker, markets, imageUrl };
    }
    catch {
        return null;
    }
}
async function fetchKalshiNbaGame(ticker) {
    try {
        const response = await fetch(`${KALSHI.API_URL}/markets?series_ticker=KXNBAGAME&limit=100`);
        if (!response.ok)
            return null;
        const data = await response.json();
        const markets = [];
        for (const market of data.markets || []) {
            if (market.ticker?.startsWith(ticker)) {
                markets.push({
                    question: market.yes_sub_title || market.title || 'Unknown',
                    yesPrice: parseFloat(market.last_price_dollars || '0') || 0,
                    volume: market.volume || 0,
                    ticker: market.ticker,
                });
            }
        }
        if (markets.length === 0)
            return null;
        return {
            title: `NBA Game: ${ticker}`,
            markets,
            imageUrl: getKalshiImageUrl('KXNBAGAME'),
        };
    }
    catch {
        return null;
    }
}
// ============ Event Processing ============
async function processMatch(match, fetchKalshi) {
    const [polyData, kalshiData] = await Promise.all([
        fetchPolymarketEvent(match.polymarketSlug),
        fetchKalshi(match.kalshiTicker, match.kalshiSeries),
    ]);
    let marketPairs;
    if (polyData && kalshiData) {
        const pairs = matchMarketsWithinEvent(polyData.markets, kalshiData.markets, match.category, match.name);
        // Add category and imageUrl to each pair
        marketPairs = pairs.map((pair) => ({
            ...pair,
            category: match.category,
            kalshi: {
                ...pair.kalshi,
                imageUrl: kalshiData.imageUrl,
            },
        }));
    }
    return {
        name: match.name,
        category: match.category,
        type: match.type,
        polymarketSlug: match.polymarketSlug,
        kalshiTicker: match.kalshiTicker,
        kalshiSeries: match.kalshiSeries,
        kalshiImageUrl: kalshiData?.imageUrl,
        date: match.date,
        polymarket: {
            found: !!polyData,
            title: polyData?.title,
            markets: polyData?.markets,
        },
        kalshi: {
            found: !!kalshiData,
            title: kalshiData?.title,
            markets: kalshiData?.markets,
        },
        marketPairs,
    };
}
async function processYearlyEvents() {
    const matches = generateYearlyMatches(CURRENT_YEAR);
    const results = [];
    for (const match of matches) {
        const result = await processMatch(match, (ticker, series) => fetchKalshiEventBySeries(ticker, series || ticker.replace(/-.*$/, '')));
        results.push(result);
        await delay(SCANNER.RATE_LIMIT_DELAY_MS);
    }
    return results;
}
async function processDynamicEvents() {
    const results = [];
    for (let dayOffset = 0; dayOffset < SCANNER.DYNAMIC_SCAN_DAYS; dayOffset++) {
        const date = new Date();
        date.setDate(date.getDate() + dayOffset);
        const matches = generateDynamicMatches(date);
        for (const match of matches) {
            const result = await processMatch(match, fetchKalshiEvent);
            results.push(result);
            await delay(SCANNER.RATE_LIMIT_DELAY_MS / 2);
        }
    }
    return results;
}
async function processNbaGames() {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + SCANNER.DYNAMIC_SCAN_DAYS);
    const games = await fetchNbaGameMatches(today, endDate);
    const results = [];
    for (const game of games) {
        const result = await processNbaGame(game);
        results.push(result);
        await delay(SCANNER.RATE_LIMIT_DELAY_MS);
    }
    return results;
}
async function processNbaGame(game) {
    const [polyData, kalshiData] = await Promise.all([
        fetchPolymarketEvent(game.polymarketSlug),
        fetchKalshiNbaGame(game.kalshiTicker),
    ]);
    let marketPairs;
    if (polyData && kalshiData) {
        marketPairs = matchNbaGameMarkets(polyData.markets, kalshiData.markets, game, kalshiData.imageUrl);
    }
    return {
        name: `${game.awayTeam} @ ${game.homeTeam}`,
        category: 'nba_game',
        type: 'dynamic',
        polymarketSlug: game.polymarketSlug,
        kalshiTicker: game.kalshiTicker,
        kalshiSeries: game.kalshiSeries,
        kalshiImageUrl: kalshiData?.imageUrl,
        date: game.date,
        polymarket: {
            found: !!polyData,
            title: polyData?.title,
            markets: polyData?.markets,
        },
        kalshi: {
            found: !!kalshiData,
            title: kalshiData?.title,
            markets: kalshiData?.markets,
        },
        marketPairs,
    };
}
function matchNbaGameMarkets(polyMarkets, kalshiMarkets, game, imageUrl) {
    const pairs = [];
    const polyMoneyline = polyMarkets.find((m) => m.question?.toLowerCase().includes('vs.') &&
        !m.question?.toLowerCase().includes('spread') &&
        !m.question?.toLowerCase().includes('o/u') &&
        !m.question?.toLowerCase().includes('over') &&
        !m.question?.toLowerCase().includes('points') &&
        !m.question?.toLowerCase().includes('rebounds') &&
        !m.question?.toLowerCase().includes('assists'));
    if (!polyMoneyline)
        return pairs;
    const awayMarket = kalshiMarkets.find((m) => m.ticker?.endsWith(`-${game.awayCode.toUpperCase()}`));
    const homeMarket = kalshiMarkets.find((m) => m.ticker?.endsWith(`-${game.homeCode.toUpperCase()}`));
    if (!awayMarket || !homeMarket)
        return pairs;
    const awayPolyYes = polyMoneyline.yesPrice;
    const awayPolyNo = 1 - awayPolyYes;
    const awayKalshiYes = awayMarket.yesPrice;
    const awayKalshiNo = 1 - awayKalshiYes;
    const awaySpread = Math.abs(awayPolyYes - awayKalshiYes);
    pairs.push({
        matchedEntity: game.awayTeam,
        eventName: `NBA: ${game.awayCode.toUpperCase()} @ ${game.homeCode.toUpperCase()}`,
        category: 'nba_game',
        polymarket: {
            question: `${game.awayTeam} wins`,
            yesPrice: awayPolyYes,
            noPrice: awayPolyNo,
            tokenIds: polyMoneyline.tokenIds,
        },
        kalshi: {
            question: awayMarket.question,
            yesPrice: awayKalshiYes,
            noPrice: awayKalshiNo,
            ticker: awayMarket.ticker,
            imageUrl,
        },
        confidence: 1.0,
        spread: awaySpread,
    });
    const homePolyYes = 1 - polyMoneyline.yesPrice;
    const homePolyNo = 1 - homePolyYes;
    const homeKalshiYes = homeMarket.yesPrice;
    const homeKalshiNo = 1 - homeKalshiYes;
    const homeSpread = Math.abs(homePolyYes - homeKalshiYes);
    pairs.push({
        matchedEntity: game.homeTeam,
        eventName: `NBA: ${game.awayCode.toUpperCase()} @ ${game.homeCode.toUpperCase()}`,
        category: 'nba_game',
        polymarket: {
            question: `${game.homeTeam} wins`,
            yesPrice: homePolyYes,
            noPrice: homePolyNo,
            tokenIds: polyMoneyline.tokenIds,
        },
        kalshi: {
            question: homeMarket.question,
            yesPrice: homeKalshiYes,
            noPrice: homeKalshiNo,
            ticker: homeMarket.ticker,
            imageUrl,
        },
        confidence: 1.0,
        spread: homeSpread,
    });
    return pairs;
}
// ============ Liquidity Analysis ============
async function analyzeOpportunityLiquidity(opp) {
    const polyTokenIds = opp.pair.polymarket.tokenIds;
    const kalshiTicker = opp.pair.kalshi.ticker;
    if (!polyTokenIds || polyTokenIds.length < 2 || !kalshiTicker) {
        return null;
    }
    try {
        const [polyBook, kalshiBook] = await Promise.all([
            fetchPolymarketOrderBook(polyTokenIds[0], polyTokenIds[1]),
            fetchKalshiOrderBook(kalshiTicker),
        ]);
        return analyzeLiquidity(opp, polyBook, kalshiBook);
    }
    catch {
        return null;
    }
}
// ============ Main Scan Function ============
export async function runScan(forceRefresh = false) {
    // Check cache
    const now = Date.now();
    if (!forceRefresh && cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedResult;
    }
    console.log('[ScannerService] Running full scan...');
    // Load mappings
    loadMappings();
    // Process all events
    const [yearlyEvents, dynamicEvents, nbaGames] = await Promise.all([
        processYearlyEvents(),
        processDynamicEvents(),
        processNbaGames(),
    ]);
    const allEvents = [...yearlyEvents, ...dynamicEvents, ...nbaGames];
    // Collect market pairs from events found on both platforms
    const bothPlatforms = allEvents.filter((e) => e.polymarket.found && e.kalshi.found);
    const allMarketPairs = bothPlatforms.flatMap((e) => e.marketPairs || []);
    // Find arbitrage opportunities
    const rawOpportunities = findArbitrageOpportunities(allMarketPairs);
    // Analyze liquidity for top opportunities
    const opportunities = [];
    const topOpps = rawOpportunities.slice(0, SCANNER.MAX_LIQUIDITY_ANALYSIS);
    for (const opp of topOpps) {
        const liquidity = await analyzeOpportunityLiquidity(opp);
        opportunities.push({ opportunity: opp, liquidity });
        await delay(SCANNER.RATE_LIMIT_DELAY_MS);
    }
    // Add remaining opportunities without liquidity analysis
    for (const opp of rawOpportunities.slice(SCANNER.MAX_LIQUIDITY_ANALYSIS)) {
        opportunities.push({ opportunity: opp, liquidity: null });
    }
    const result = {
        events: allEvents,
        opportunities,
        scannedAt: new Date(),
    };
    // Update cache
    cachedResult = result;
    cacheTimestamp = now;
    console.log(`[ScannerService] Scan complete: ${allEvents.length} events, ${opportunities.length} opportunities`);
    return result;
}
export function getCachedResult() {
    const now = Date.now();
    if (cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedResult;
    }
    return null;
}
