/**
 * Rate Limit Tester
 *
 * Tests Polymarket and Kalshi APIs to determine rate limiting thresholds.
 * Progressively increases request frequency until rate limits are hit.
 *
 * Run: npx tsx src/scripts/test-rate-limits.ts
 */

import { POLYMARKET, KALSHI } from '../config/api.js';

// ============ Types ============

interface RequestResult {
  success: boolean;
  status: number;
  latencyMs: number;
  rateLimited: boolean;
  error?: string;
}

interface BurstTestResult {
  burstSize: number;
  delayMs: number;
  results: RequestResult[];
  successCount: number;
  rateLimitCount: number;
  errorCount: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
}

interface RateLimitReport {
  platform: string;
  testedAt: string;
  burstTests: BurstTestResult[];
  sustainedTests: SustainedTestResult[];
  findings: {
    safeBurstSize: number;
    safeRequestsPerSecond: number;
    rateLimitThreshold: string;
    recommendedDelayMs: number;
  };
}

interface SustainedTestResult {
  requestsPerSecond: number;
  durationSeconds: number;
  totalRequests: number;
  successCount: number;
  rateLimitCount: number;
  firstRateLimitAt: number | null;
  avgLatencyMs: number;
}

// ============ Test Functions ============

async function testPolymarketRequest(): Promise<RequestResult> {
  const start = performance.now();
  try {
    // Use a known slug that exists
    const response = await fetch(`${POLYMARKET.GAMMA_API_URL}/events?slug=2026-nhl-stanley-cup-champion`);
    const latencyMs = performance.now() - start;

    return {
      success: response.ok,
      status: response.status,
      latencyMs,
      rateLimited: response.status === 429,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error: any) {
    return {
      success: false,
      status: 0,
      latencyMs: performance.now() - start,
      rateLimited: false,
      error: error.message,
    };
  }
}

async function testKalshiRequest(): Promise<RequestResult> {
  const start = performance.now();
  try {
    const response = await fetch(`${KALSHI.API_URL}/markets?series_ticker=KXNHL&limit=10`);
    const latencyMs = performance.now() - start;

    return {
      success: response.ok,
      status: response.status,
      latencyMs,
      rateLimited: response.status === 429,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error: any) {
    return {
      success: false,
      status: 0,
      latencyMs: performance.now() - start,
      rateLimited: false,
      error: error.message,
    };
  }
}

// ============ Burst Testing ============

async function runBurstTest(
  platform: 'polymarket' | 'kalshi',
  burstSize: number,
  delayBetweenMs: number
): Promise<BurstTestResult> {
  const testFn = platform === 'polymarket' ? testPolymarketRequest : testKalshiRequest;
  const results: RequestResult[] = [];

  for (let i = 0; i < burstSize; i++) {
    const result = await testFn();
    results.push(result);

    if (delayBetweenMs > 0 && i < burstSize - 1) {
      await delay(delayBetweenMs);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const rateLimitCount = results.filter(r => r.rateLimited).length;
  const errorCount = results.filter(r => !r.success && !r.rateLimited).length;
  const latencies = results.map(r => r.latencyMs);
  const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLatencyMs = Math.max(...latencies);

  return {
    burstSize,
    delayMs: delayBetweenMs,
    results,
    successCount,
    rateLimitCount,
    errorCount,
    avgLatencyMs,
    maxLatencyMs,
  };
}

// ============ Sustained Load Testing ============

async function runSustainedTest(
  platform: 'polymarket' | 'kalshi',
  requestsPerSecond: number,
  durationSeconds: number
): Promise<SustainedTestResult> {
  const testFn = platform === 'polymarket' ? testPolymarketRequest : testKalshiRequest;
  const delayMs = 1000 / requestsPerSecond;
  const totalRequests = Math.floor(requestsPerSecond * durationSeconds);

  let successCount = 0;
  let rateLimitCount = 0;
  let firstRateLimitAt: number | null = null;
  let totalLatency = 0;

  for (let i = 0; i < totalRequests; i++) {
    const result = await testFn();
    totalLatency += result.latencyMs;

    if (result.success) {
      successCount++;
    } else if (result.rateLimited) {
      rateLimitCount++;
      if (firstRateLimitAt === null) {
        firstRateLimitAt = i + 1;
      }
    }

    // Adjust delay to maintain target rate
    const elapsed = result.latencyMs;
    const waitTime = Math.max(0, delayMs - elapsed);
    if (waitTime > 0) {
      await delay(waitTime);
    }
  }

  return {
    requestsPerSecond,
    durationSeconds,
    totalRequests,
    successCount,
    rateLimitCount,
    firstRateLimitAt,
    avgLatencyMs: totalLatency / totalRequests,
  };
}

// ============ Parallel Burst Testing ============

async function runParallelBurstTest(
  platform: 'polymarket' | 'kalshi',
  parallelCount: number
): Promise<BurstTestResult> {
  const testFn = platform === 'polymarket' ? testPolymarketRequest : testKalshiRequest;

  // Fire all requests simultaneously
  const promises = Array(parallelCount).fill(null).map(() => testFn());
  const results = await Promise.all(promises);

  const successCount = results.filter(r => r.success).length;
  const rateLimitCount = results.filter(r => r.rateLimited).length;
  const errorCount = results.filter(r => !r.success && !r.rateLimited).length;
  const latencies = results.map(r => r.latencyMs);
  const avgLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLatencyMs = Math.max(...latencies);

  return {
    burstSize: parallelCount,
    delayMs: 0,
    results,
    successCount,
    rateLimitCount,
    errorCount,
    avgLatencyMs,
    maxLatencyMs,
  };
}

// ============ Utilities ============

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

// ============ Report Generation ============

function printHeader(title: string): void {
  const width = 80;
  console.log('\n' + '═'.repeat(width));
  console.log(`  ${title}`);
  console.log('═'.repeat(width));
}

function printSubheader(title: string): void {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

async function testPlatform(platform: 'polymarket' | 'kalshi'): Promise<RateLimitReport> {
  const platformName = platform === 'polymarket' ? 'Polymarket' : 'Kalshi';
  printHeader(`Testing ${platformName} Rate Limits`);

  const burstTests: BurstTestResult[] = [];
  const sustainedTests: SustainedTestResult[] = [];

  // Test 1: Sequential burst with no delay
  printSubheader('Test 1: Sequential Burst (no delay)');
  for (const size of [5, 10, 20, 30]) {
    process.stdout.write(`  Testing ${size} sequential requests... `);
    const result = await runBurstTest(platform, size, 0);
    burstTests.push(result);
    console.log(
      `✓ ${result.successCount}/${size} OK, ${result.rateLimitCount} rate-limited, avg ${formatMs(result.avgLatencyMs)}`
    );

    // Stop if we hit rate limits
    if (result.rateLimitCount > 0) {
      console.log(`  ⚠️  Rate limit hit at ${size} requests!`);
      break;
    }

    // Cool down between tests
    await delay(2000);
  }

  // Test 2: Parallel burst
  printSubheader('Test 2: Parallel Burst (simultaneous)');
  for (const size of [3, 5, 10, 15, 20]) {
    process.stdout.write(`  Testing ${size} parallel requests... `);
    const result = await runParallelBurstTest(platform, size);
    burstTests.push(result);
    console.log(
      `✓ ${result.successCount}/${size} OK, ${result.rateLimitCount} rate-limited, avg ${formatMs(result.avgLatencyMs)}`
    );

    if (result.rateLimitCount > 0) {
      console.log(`  ⚠️  Rate limit hit at ${size} parallel requests!`);
      break;
    }

    await delay(2000);
  }

  // Test 3: Sustained load at different rates
  printSubheader('Test 3: Sustained Load (5 seconds each)');
  for (const rps of [1, 2, 5, 10, 15, 20]) {
    process.stdout.write(`  Testing ${rps} req/sec for 5s... `);
    const result = await runSustainedTest(platform, rps, 5);
    sustainedTests.push(result);

    const status = result.rateLimitCount > 0
      ? `⚠️  ${result.rateLimitCount} rate-limited (first at request #${result.firstRateLimitAt})`
      : `✓ ${result.successCount}/${result.totalRequests} OK`;
    console.log(`${status}, avg ${formatMs(result.avgLatencyMs)}`);

    if (result.rateLimitCount > result.totalRequests * 0.5) {
      console.log(`  ⛔ Too many rate limits, stopping sustained tests`);
      break;
    }

    await delay(3000);
  }

  // Analyze findings
  const safeBurstSize = findSafeBurstSize(burstTests);
  const safeRps = findSafeRps(sustainedTests);

  return {
    platform: platformName,
    testedAt: new Date().toISOString(),
    burstTests,
    sustainedTests,
    findings: {
      safeBurstSize,
      safeRequestsPerSecond: safeRps,
      rateLimitThreshold: describeThreshold(burstTests, sustainedTests),
      recommendedDelayMs: Math.ceil(1000 / safeRps),
    },
  };
}

function findSafeBurstSize(tests: BurstTestResult[]): number {
  let safeBurst = 1;
  for (const test of tests) {
    if (test.rateLimitCount === 0 && test.delayMs === 0) {
      safeBurst = Math.max(safeBurst, test.burstSize);
    }
  }
  return safeBurst;
}

function findSafeRps(tests: SustainedTestResult[]): number {
  let safeRps = 1;
  for (const test of tests) {
    if (test.rateLimitCount === 0) {
      safeRps = Math.max(safeRps, test.requestsPerSecond);
    }
  }
  return safeRps;
}

function describeThreshold(bursts: BurstTestResult[], sustained: SustainedTestResult[]): string {
  const firstBurstLimit = bursts.find(t => t.rateLimitCount > 0);
  const firstSustainedLimit = sustained.find(t => t.rateLimitCount > 0);

  const parts: string[] = [];
  if (firstBurstLimit) {
    parts.push(`Burst: ${firstBurstLimit.burstSize} requests`);
  }
  if (firstSustainedLimit) {
    parts.push(`Sustained: ${firstSustainedLimit.requestsPerSecond} req/sec`);
  }

  return parts.length > 0 ? parts.join(', ') : 'Not reached in tests';
}

// ============ Main ============

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                      RATE LIMIT TESTER                                     ║');
  console.log('║  Testing Polymarket and Kalshi APIs to find rate limiting thresholds       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n⚠️  This test makes many API requests. It may temporarily rate-limit you.\n');

  // Test Polymarket
  const polyReport = await testPlatform('polymarket');

  // Cool down before testing Kalshi
  console.log('\n⏳ Cooling down for 5 seconds before testing Kalshi...\n');
  await delay(5000);

  // Test Kalshi
  const kalshiReport = await testPlatform('kalshi');

  // Final Summary
  printHeader('FINAL SUMMARY');

  console.log('\n  Platform      Safe Burst    Safe RPS    Recommended Delay');
  console.log('  ' + '─'.repeat(56));
  console.log(
    `  Polymarket    ${polyReport.findings.safeBurstSize.toString().padEnd(13)} ` +
    `${polyReport.findings.safeRequestsPerSecond.toString().padEnd(11)} ` +
    `${polyReport.findings.recommendedDelayMs}ms`
  );
  console.log(
    `  Kalshi        ${kalshiReport.findings.safeBurstSize.toString().padEnd(13)} ` +
    `${kalshiReport.findings.safeRequestsPerSecond.toString().padEnd(11)} ` +
    `${kalshiReport.findings.recommendedDelayMs}ms`
  );

  console.log('\n  Rate Limit Thresholds:');
  console.log(`    Polymarket: ${polyReport.findings.rateLimitThreshold}`);
  console.log(`    Kalshi:     ${kalshiReport.findings.rateLimitThreshold}`);

  // Recommendations
  printSubheader('💡 RECOMMENDATIONS');

  const minSafeDelay = Math.max(
    polyReport.findings.recommendedDelayMs,
    kalshiReport.findings.recommendedDelayMs
  );

  console.log(`\n  1. Sequential requests: Use ${minSafeDelay}ms delay between calls`);
  console.log(`  2. Parallel requests: Limit to ${Math.min(polyReport.findings.safeBurstSize, kalshiReport.findings.safeBurstSize)} concurrent`);
  console.log(`  3. Burst with backoff: Start fast, add delay if 429 received`);

  const safeParallelPerPlatform = Math.min(
    polyReport.findings.safeBurstSize,
    kalshiReport.findings.safeBurstSize
  );

  console.log(`\n  Optimal Strategy for Event Fetching:`);
  console.log(`    • Fetch Poly + Kalshi in parallel per event (2 concurrent)`);
  console.log(`    • Process ${safeParallelPerPlatform} events in parallel`);
  console.log(`    • Add ${minSafeDelay}ms delay between event batches`);

  const estimatedEventsPerSecond = safeParallelPerPlatform / (minSafeDelay / 1000 + 0.1);
  console.log(`    • Estimated throughput: ~${estimatedEventsPerSecond.toFixed(1)} events/sec`);

  console.log('\n' + '═'.repeat(80) + '\n');
}

main().catch(console.error);
