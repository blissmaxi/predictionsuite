/**
 * Aggressive Rate Limit Tester
 *
 * Pushes harder to find actual rate limits on Polymarket and Kalshi.
 *
 * Run: npx tsx src/scripts/test-rate-limits-aggressive.ts
 */

import { POLYMARKET, KALSHI } from '../config/api.js';

interface TestResult {
  requestNum: number;
  success: boolean;
  status: number;
  latencyMs: number;
  timestamp: number;
}

async function testPolymarket(): Promise<TestResult> {
  const start = performance.now();
  const timestamp = Date.now();
  try {
    const response = await fetch(`${POLYMARKET.GAMMA_API_URL}/events?slug=2026-nhl-stanley-cup-champion`);
    return {
      requestNum: 0,
      success: response.ok,
      status: response.status,
      latencyMs: performance.now() - start,
      timestamp,
    };
  } catch (error: any) {
    return {
      requestNum: 0,
      success: false,
      status: 0,
      latencyMs: performance.now() - start,
      timestamp,
    };
  }
}

async function testKalshi(): Promise<TestResult> {
  const start = performance.now();
  const timestamp = Date.now();
  try {
    const response = await fetch(`${KALSHI.API_URL}/markets?series_ticker=KXNHL&limit=10`);
    return {
      requestNum: 0,
      success: response.ok,
      status: response.status,
      latencyMs: performance.now() - start,
      timestamp,
    };
  } catch (error: any) {
    return {
      requestNum: 0,
      success: false,
      status: 0,
      latencyMs: performance.now() - start,
      timestamp,
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function aggressiveBurstTest(
  platform: 'polymarket' | 'kalshi',
  count: number
): Promise<{ results: TestResult[]; rateLimitedAt: number | null }> {
  const testFn = platform === 'polymarket' ? testPolymarket : testKalshi;
  const results: TestResult[] = [];
  let rateLimitedAt: number | null = null;

  // Fire all requests as fast as possible (parallel)
  const promises = Array(count).fill(null).map(async (_, i) => {
    const result = await testFn();
    result.requestNum = i + 1;
    return result;
  });

  const allResults = await Promise.all(promises);

  for (const result of allResults) {
    results.push(result);
    if (result.status === 429 && rateLimitedAt === null) {
      rateLimitedAt = result.requestNum;
    }
  }

  return { results, rateLimitedAt };
}

async function sustainedHighLoad(
  platform: 'polymarket' | 'kalshi',
  rps: number,
  durationSec: number
): Promise<{ total: number; success: number; rateLimited: number; errors: number; firstRateLimitAt: number | null }> {
  const testFn = platform === 'polymarket' ? testPolymarket : testKalshi;
  const delayMs = 1000 / rps;
  const totalRequests = rps * durationSec;

  let success = 0;
  let rateLimited = 0;
  let errors = 0;
  let firstRateLimitAt: number | null = null;

  for (let i = 0; i < totalRequests; i++) {
    const start = performance.now();
    const result = await testFn();

    if (result.status === 429) {
      rateLimited++;
      if (firstRateLimitAt === null) firstRateLimitAt = i + 1;
    } else if (result.success) {
      success++;
    } else {
      errors++;
    }

    const elapsed = performance.now() - start;
    const wait = Math.max(0, delayMs - elapsed);
    if (wait > 0) await delay(wait);
  }

  return { total: totalRequests, success, rateLimited, errors, firstRateLimitAt };
}

async function testPlatformAggressively(platform: 'polymarket' | 'kalshi'): Promise<void> {
  const name = platform === 'polymarket' ? 'Polymarket' : 'Kalshi';
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  AGGRESSIVE TESTING: ${name}`);
  console.log('═'.repeat(70));

  // Test 1: Massive parallel burst
  console.log('\n📊 Test 1: Parallel Burst (finding limit)');
  for (const count of [50, 100, 150, 200]) {
    process.stdout.write(`   ${count} parallel requests... `);
    const { results, rateLimitedAt } = await aggressiveBurstTest(platform, count);

    const success = results.filter(r => r.success).length;
    const limited = results.filter(r => r.status === 429).length;
    const avgLatency = results.reduce((a, b) => a + b.latencyMs, 0) / results.length;

    if (limited > 0) {
      console.log(`⚠️  ${success}/${count} OK, ${limited} rate-limited (first at #${rateLimitedAt}), avg ${avgLatency.toFixed(0)}ms`);
      break;
    } else {
      console.log(`✓ ${success}/${count} OK, avg ${avgLatency.toFixed(0)}ms`);
    }

    await delay(3000); // Cool down
  }

  // Test 2: Very high sustained load
  console.log('\n📊 Test 2: Sustained High Load');
  for (const rps of [30, 50, 75, 100]) {
    process.stdout.write(`   ${rps} req/sec for 10s (${rps * 10} total)... `);
    const result = await sustainedHighLoad(platform, rps, 10);

    if (result.rateLimited > 0) {
      console.log(`⚠️  ${result.success}/${result.total} OK, ${result.rateLimited} rate-limited (first at #${result.firstRateLimitAt})`);
      break;
    } else {
      console.log(`✓ ${result.success}/${result.total} OK`);
    }

    await delay(5000); // Longer cool down
  }

  // Test 3: Continuous load until rate limited
  console.log('\n📊 Test 3: Find Breaking Point (continuous until rate-limited)');
  const testFn = platform === 'polymarket' ? testPolymarket : testKalshi;
  let consecutiveSuccess = 0;
  let totalSent = 0;
  let rateLimitHit = false;
  const maxRequests = 500;

  process.stdout.write('   Sending requests continuously: ');
  const startTime = Date.now();

  while (totalSent < maxRequests && !rateLimitHit) {
    // Send 10 parallel requests
    const promises = Array(10).fill(null).map(() => testFn());
    const results = await Promise.all(promises);
    totalSent += 10;

    const limited = results.filter(r => r.status === 429).length;
    if (limited > 0) {
      rateLimitHit = true;
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`\n   ⚠️  Rate limited after ${totalSent} requests in ${elapsed.toFixed(1)}s`);
      console.log(`   ⚠️  Effective rate: ${(totalSent / elapsed).toFixed(1)} req/sec before limit`);
    } else {
      consecutiveSuccess += 10;
      if (totalSent % 100 === 0) {
        process.stdout.write(`${totalSent}...`);
      }
    }
  }

  if (!rateLimitHit) {
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`\n   ✓ No rate limit after ${totalSent} requests in ${elapsed.toFixed(1)}s`);
    console.log(`   ✓ Achieved rate: ${(totalSent / elapsed).toFixed(1)} req/sec`);
  }
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║              AGGRESSIVE RATE LIMIT TESTER                               ║');
  console.log('║  Pushing APIs hard to find actual rate limiting thresholds              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log('\n⚠️  WARNING: This will send hundreds of requests. You may get temporarily blocked.\n');

  await testPlatformAggressively('polymarket');

  console.log('\n⏳ Cooling down for 10 seconds before testing Kalshi...');
  await delay(10000);

  await testPlatformAggressively('kalshi');

  console.log('\n' + '═'.repeat(70));
  console.log('  TESTING COMPLETE');
  console.log('═'.repeat(70) + '\n');
}

main().catch(console.error);
