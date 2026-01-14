/**
 * Kalshi API Explorer
 * Explores the Kalshi Trade API to understand data models
 */
// API Base URL
const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';
// ============ API Functions ============
async function fetchEvents(limit = 20, status = 'open') {
    const params = new URLSearchParams({
        limit: limit.toString(),
        status,
    });
    const response = await fetch(`${KALSHI_API_URL}/events?${params}`);
    if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.events;
}
async function fetchEventWithMarkets(eventTicker) {
    const response = await fetch(`${KALSHI_API_URL}/events/${eventTicker}`);
    if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}
async function fetchMarkets(limit = 20, status = 'open') {
    const params = new URLSearchParams({
        limit: limit.toString(),
        status,
    });
    const response = await fetch(`${KALSHI_API_URL}/markets?${params}`);
    if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.markets;
}
async function fetchMarket(ticker) {
    const response = await fetch(`${KALSHI_API_URL}/markets/${ticker}`);
    if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.market;
}
async function fetchOrderBook(marketTicker) {
    const response = await fetch(`${KALSHI_API_URL}/markets/${marketTicker}/orderbook`);
    if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}
async function fetchSeries(limit = 10) {
    const params = new URLSearchParams({
        limit: limit.toString(),
    });
    const response = await fetch(`${KALSHI_API_URL}/series?${params}`);
    if (!response.ok) {
        throw new Error(`Kalshi API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.series;
}
// ============ Data Processing Functions ============
/**
 * Convert Kalshi cents (0-100) to probability (0-1)
 */
function centsToProbability(cents) {
    return cents / 100;
}
function summarizeMarket(market) {
    return {
        ticker: market.ticker,
        title: market.title || market.yes_sub_title,
        eventTicker: market.event_ticker,
        yesBid: centsToProbability(market.yes_bid),
        yesAsk: centsToProbability(market.yes_ask),
        noBid: centsToProbability(market.no_bid),
        noAsk: centsToProbability(market.no_ask),
        lastPrice: centsToProbability(market.last_price),
        volume: market.volume,
        liquidity: market.liquidity / 100, // Convert to dollars
        status: market.status,
    };
}
function summarizeEvent(event, markets) {
    return {
        ticker: event.event_ticker,
        title: event.title,
        category: event.category,
        marketCount: markets.length,
        markets: markets.map(summarizeMarket),
    };
}
// ============ Display Functions ============
function printDivider(title) {
    console.log('\n' + '='.repeat(60));
    console.log(` ${title}`);
    console.log('='.repeat(60));
}
function printEventSummary(summary) {
    console.log(`\n[Event] ${summary.title}`);
    console.log(`  Ticker: ${summary.ticker}`);
    console.log(`  Category: ${summary.category}`);
    console.log(`  Markets: ${summary.marketCount}`);
    for (const market of summary.markets.slice(0, 5)) {
        console.log(`\n  [Market] ${market.title}`);
        console.log(`    Ticker: ${market.ticker}`);
        console.log(`    YES: Bid $${market.yesBid.toFixed(2)} / Ask $${market.yesAsk.toFixed(2)}`);
        console.log(`    NO:  Bid $${market.noBid.toFixed(2)} / Ask $${market.noAsk.toFixed(2)}`);
        console.log(`    Last: $${market.lastPrice.toFixed(2)} | Volume: ${market.volume} | Liquidity: $${market.liquidity.toLocaleString()}`);
    }
    if (summary.markets.length > 5) {
        console.log(`\n  ... and ${summary.markets.length - 5} more markets`);
    }
}
function printOrderBook(orderBook, marketTicker) {
    console.log(`\n[Order Book] ${marketTicker}`);
    const yesOrders = orderBook.orderbook.yes_dollars ?? [];
    const noOrders = orderBook.orderbook.no_dollars ?? [];
    console.log('  YES side (bids to buy YES):');
    if (yesOrders.length === 0) {
        console.log('    (empty)');
    }
    else {
        for (const [price, qty] of yesOrders.slice(0, 5)) {
            console.log(`    $${price} x ${qty}`);
        }
        if (yesOrders.length > 5) {
            console.log(`    ... and ${yesOrders.length - 5} more levels`);
        }
    }
    console.log('  NO side (bids to buy NO):');
    if (noOrders.length === 0) {
        console.log('    (empty)');
    }
    else {
        for (const [price, qty] of noOrders.slice(0, 5)) {
            console.log(`    $${price} x ${qty}`);
        }
        if (noOrders.length > 5) {
            console.log(`    ... and ${noOrders.length - 5} more levels`);
        }
    }
    // Calculate spread if both sides have orders
    if (yesOrders.length > 0 && noOrders.length > 0) {
        const bestYesBid = parseFloat(yesOrders[yesOrders.length - 1][0]);
        const bestNoBid = parseFloat(noOrders[noOrders.length - 1][0]);
        // In Kalshi, YES + NO should equal 1, so spread = 1 - bestYesBid - bestNoBid
        const impliedSpread = 1 - bestYesBid - bestNoBid;
        console.log(`  Implied spread: $${impliedSpread.toFixed(4)}`);
    }
}
// ============ Main Exploration ============
async function main() {
    console.log('Kalshi API Explorer');
    console.log('===================\n');
    // 1. Fetch open events
    printDivider('FETCHING OPEN EVENTS');
    try {
        const events = await fetchEvents(5, 'open');
        console.log(`Fetched ${events.length} events`);
        for (const event of events.slice(0, 3)) {
            const eventWithMarkets = await fetchEventWithMarkets(event.event_ticker);
            const summary = summarizeEvent(event, eventWithMarkets.markets);
            printEventSummary(summary);
        }
    }
    catch (error) {
        console.error('Failed to fetch events:', error);
    }
    // 2. Fetch series (templates)
    printDivider('FETCHING SERIES (Templates)');
    try {
        const series = await fetchSeries(5);
        console.log(`Fetched ${series.length} series`);
        for (const s of series) {
            console.log(`\n[Series] ${s.title}`);
            console.log(`  Ticker: ${s.ticker}`);
            console.log(`  Category: ${s.category}`);
            console.log(`  Frequency: ${s.frequency}`);
            console.log(`  Fee type: ${s.fee_type}`);
        }
    }
    catch (error) {
        console.error('Failed to fetch series:', error);
    }
    // 3. Explore order book
    printDivider('EXPLORING ORDER BOOK');
    try {
        // Get an event with markets that have liquidity
        const eventWithMarkets = await fetchEventWithMarkets('KXNEWPOPE-70');
        const activeMarket = eventWithMarkets.markets.find(m => m.liquidity > 0);
        if (activeMarket) {
            console.log(`\nFetching order book for: ${activeMarket.title || activeMarket.yes_sub_title}`);
            const orderBook = await fetchOrderBook(activeMarket.ticker);
            printOrderBook(orderBook, activeMarket.ticker);
        }
        else {
            console.log('No markets with liquidity found');
        }
    }
    catch (error) {
        console.error('Order book exploration failed:', error);
    }
    // 4. Show raw market structure
    printDivider('RAW API RESPONSE SAMPLE');
    try {
        const events = await fetchEvents(1, 'open');
        if (events.length > 0) {
            const eventWithMarkets = await fetchEventWithMarkets(events[0].event_ticker);
            console.log('\nSample Event JSON structure:');
            console.log(JSON.stringify(eventWithMarkets.event, null, 2));
            if (eventWithMarkets.markets.length > 0) {
                console.log('\nSample Market JSON structure (truncated):');
                const market = eventWithMarkets.markets[0];
                const truncated = {
                    ticker: market.ticker,
                    event_ticker: market.event_ticker,
                    title: market.title,
                    status: market.status,
                    yes_bid: market.yes_bid,
                    yes_ask: market.yes_ask,
                    no_bid: market.no_bid,
                    no_ask: market.no_ask,
                    last_price: market.last_price,
                    volume: market.volume,
                    liquidity: market.liquidity,
                    price_level_structure: market.price_level_structure,
                };
                console.log(JSON.stringify(truncated, null, 2));
            }
        }
    }
    catch (error) {
        console.error('Failed to fetch sample:', error);
    }
    printDivider('EXPLORATION COMPLETE');
    console.log('\nKey findings:');
    console.log('- Events contain multiple markets (binary outcomes)');
    console.log('- Prices are in cents (0-100), divide by 100 for probability');
    console.log('- Order book shows YES and NO sides separately');
    console.log('- Series are templates for recurring events');
    console.log('- No authentication required for read-only access');
}
main().catch(console.error);
export {};
