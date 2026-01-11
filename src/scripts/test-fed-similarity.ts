/**
 * Test similarity between Fed decision events
 */

import { normalizeText, tokenizeWithSynonyms } from '../matching/text-normalizer.js';
import { levenshteinSimilarity, jaccardSimilarity } from '../matching/similarity.js';

const polyTitle = 'Fed decision in January?';
const kalshiTitle = 'Fed decision in Jan 2026?';

console.log('Polymarket:', polyTitle);
console.log('Kalshi:', kalshiTitle);
console.log('');
console.log('Title similarity:', (levenshteinSimilarity(polyTitle, kalshiTitle) * 100).toFixed(1) + '%');

const polyTokens = new Set(tokenizeWithSynonyms(normalizeText(polyTitle)));
const kalshiTokens = new Set(tokenizeWithSynonyms(normalizeText(kalshiTitle)));
console.log('Poly tokens:', [...polyTokens]);
console.log('Kalshi tokens:', [...kalshiTokens]);
console.log('Token overlap:', (jaccardSimilarity(polyTokens, kalshiTokens) * 100).toFixed(1) + '%');

// Also test some other pairs
console.log('\n========== OTHER PAIRS ==========\n');

const pairs = [
  ['Fed decision in January?', 'Fed decision in Mar 2026?'],
  ['How many Fed rate cuts in 2026?', 'Fed funds rate after Jan 2027 meeting?'],
  ['Fed abolished before 2027?', 'Will Trump end the Federal Reserve?'],
];

for (const [a, b] of pairs) {
  const tokensA = new Set(tokenizeWithSynonyms(normalizeText(a)));
  const tokensB = new Set(tokenizeWithSynonyms(normalizeText(b)));

  console.log(`"${a}"`);
  console.log(`"${b}"`);
  console.log(`  Title: ${(levenshteinSimilarity(a, b) * 100).toFixed(1)}%`);
  console.log(`  Token: ${(jaccardSimilarity(tokensA, tokensB) * 100).toFixed(1)}%`);
  console.log('');
}
