/**
 * Lookup Polymarket market/event by slug and display token IDs.
 *
 * Usage:
 *   npx tsx src/scripts/polymarket-lookup.ts <slug>
 *
 * Examples:
 *   npx tsx src/scripts/polymarket-lookup.ts will-trump-acquire-greenland-before-2027
 *   npx tsx src/scripts/polymarket-lookup.ts super-bowl-champion-2026-731
 */

interface Market {
  question: string;
  slug: string;
  clobTokenIds: string;
  outcomePrices: string;
  outcomes: string;
}

interface Event {
  title: string;
  slug: string;
  markets: Market[];
}

function parseJsonString(str: string | null | undefined): string[] {
  if (!str) return [];
  try {
    return JSON.parse(str);
  } catch {
    return [];
  }
}

function formatTokenId(id: string): string {
  if (id.length > 20) {
    return `${id.slice(0, 12)}...${id.slice(-12)}`;
  }
  return id;
}

async function lookupMarket(slug: string): Promise<void> {
  // Try as market slug first
  const marketRes = await fetch(`https://gamma-api.polymarket.com/markets?slug=${slug}`);
  const markets = await marketRes.json() as Market[];

  if (markets.length > 0) {
    console.log('\n=== MARKET ===\n');
    for (const market of markets) {
      printMarket(market);
    }
    return;
  }

  // Try as event slug
  const eventRes = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
  const events = await eventRes.json() as Event[];

  if (events.length > 0) {
    console.log('\n=== EVENT ===\n');
    for (const event of events) {
      console.log(`Event: ${event.title}`);
      console.log(`Slug:  ${event.slug}`);
      console.log(`Markets: ${event.markets.length}\n`);
      console.log('─'.repeat(70));

      for (const market of event.markets) {
        printMarket(market);
        console.log('─'.repeat(70));
      }
    }
    return;
  }

  console.error(`No market or event found for slug: ${slug}`);
  process.exit(1);
}

function printMarket(market: Market): void {
  const tokens = parseJsonString(market.clobTokenIds);
  const prices = parseJsonString(market.outcomePrices);
  const outcomes = parseJsonString(market.outcomes);

  console.log(`Question: ${market.question}`);
  console.log(`Slug:     ${market.slug || '(none)'}`);
  console.log('');

  if (tokens.length >= 2) {
    const yesLabel = outcomes[0] || 'YES';
    const noLabel = outcomes[1] || 'NO';
    const yesPrice = prices[0] ? `${(parseFloat(prices[0]) * 100).toFixed(1)}¢` : '?';
    const noPrice = prices[1] ? `${(parseFloat(prices[1]) * 100).toFixed(1)}¢` : '?';

    console.log(`  ${yesLabel} (${yesPrice}):`);
    console.log(`    ${tokens[0]}`);
    console.log('');
    console.log(`  ${noLabel} (${noPrice}):`);
    console.log(`    ${tokens[1]}`);
    console.log('');

    // Print ready-to-use command
    console.log('  Test command:');
    console.log(`    npx tsx src/scripts/test-polymarket-websocket.ts ${formatTokenId(tokens[0])} ${formatTokenId(tokens[1])}`);
    console.log('');
    console.log('  Full command:');
    console.log(`    npx tsx src/scripts/test-polymarket-websocket.ts ${tokens[0]} ${tokens[1]}`);
  } else {
    console.log('  No token IDs available');
  }
  console.log('');
}

// Main
const slug = process.argv[2];

if (!slug) {
  console.log('Usage: npx tsx src/scripts/polymarket-lookup.ts <slug>');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/scripts/polymarket-lookup.ts will-trump-acquire-greenland-before-2027');
  console.log('  npx tsx src/scripts/polymarket-lookup.ts super-bowl-champion-2026-731');
  process.exit(1);
}

lookupMarket(slug);
