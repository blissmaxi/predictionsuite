/**
 * Text Normalizer
 *
 * Text preprocessing utilities for event matching.
 * Handles normalization, tokenization, abbreviations, and synonyms.
 */

// ============ Stopwords ============

/**
 * Common English stopwords to remove during tokenization.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'we', 'they', 'what', 'which', 'who', 'whom', 'when', 'where', 'why',
  'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'about', 'above', 'after', 'again', 'against',
  'before', 'below', 'between', 'during', 'into', 'through', 'under',
  'until', 'up', 'down', 'out', 'off', 'over', 'then', 'once', 'here',
  'there', 'any', 'if', 'because', 'while', 'although', 'whether',
]);

// ============ Abbreviations ============

/**
 * Common abbreviations and their expansions.
 */
const ABBREVIATIONS: Record<string, string> = {
  // Politics
  'gop': 'republican',
  'dem': 'democrat',
  'dems': 'democrat',
  'potus': 'president',
  'scotus': 'supreme court',
  'vp': 'vice president',
  'gov': 'governor',
  'sen': 'senator',
  'rep': 'representative',
  'sec': 'secretary',

  // Finance
  'fed': 'federal reserve',
  'fomc': 'federal reserve',
  'cpi': 'consumer price index',
  'gdp': 'gross domestic product',
  'ipo': 'initial public offering',
  'nyse': 'new york stock exchange',

  // Sports
  'nfl': 'national football league',
  'nba': 'national basketball association',
  'mlb': 'major league baseball',
  'nhl': 'national hockey league',
  'ncaa': 'college',
  'cfp': 'college football playoff',
  'mvp': 'most valuable player',

  // Tech
  'ai': 'artificial intelligence',
  'ceo': 'chief executive officer',
  'ipo': 'initial public offering',

  // Other
  'uk': 'united kingdom',
  'us': 'united states',
  'usa': 'united states',
  'eu': 'european union',
  'un': 'united nations',
  'pm': 'prime minister',
  'vs': 'versus',
  'v': 'versus',
};

// ============ Synonyms ============

/**
 * Groups of synonymous words that should be treated as equivalent.
 * First word in each group is the canonical form.
 */
const SYNONYM_GROUPS: string[][] = [
  // Outcome words
  ['win', 'winner', 'winning', 'won', 'champion', 'champions', 'victory'],
  ['nominate', 'nominee', 'nomination', 'pick', 'picked', 'choose', 'chosen', 'select', 'selected'],
  ['elect', 'elected', 'election', 'vote', 'voting'],

  // Events
  ['super bowl', 'superbowl', 'pro football champion'],
  ['world series', 'mlb champion'],
  ['stanley cup', 'nhl champion'],
  ['nba finals', 'nba champion'],
  ['march madness', 'ncaa tournament', 'college basketball champion'],

  // Politics
  ['president', 'presidential', 'potus'],
  ['republican', 'gop', 'republicans'],
  ['democrat', 'democratic', 'democrats', 'dems'],

  // Finance
  ['interest rate', 'rate cut', 'rate hike', 'fed funds'],
  ['inflation', 'cpi', 'prices'],

  // Time
  ['january', 'jan'],
  ['february', 'feb'],
  ['march', 'mar'],
  ['april', 'apr'],
  ['may', 'may'],
  ['june', 'jun'],
  ['july', 'jul'],
  ['august', 'aug'],
  ['september', 'sep', 'sept'],
  ['october', 'oct'],
  ['november', 'nov'],
  ['december', 'dec'],
];

/**
 * Map from any synonym to its canonical form.
 */
const SYNONYM_MAP: Map<string, string> = new Map();

// Build synonym map
for (const group of SYNONYM_GROUPS) {
  const canonical = group[0].toLowerCase();
  for (const word of group) {
    SYNONYM_MAP.set(word.toLowerCase(), canonical);
  }
}

// ============ Normalization Functions ============

/**
 * Normalize text for comparison.
 * Lowercases, removes punctuation, and expands abbreviations.
 *
 * @param text Raw text to normalize
 * @returns Normalized text
 */
export function normalizeText(text: string): string {
  let normalized = text.toLowerCase();

  // Remove punctuation except apostrophes in contractions
  normalized = normalized.replace(/[^\w\s']/g, ' ');

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Expand abbreviations
  const words = normalized.split(' ');
  const expanded = words.map(word => {
    const abbrev = ABBREVIATIONS[word];
    return abbrev || word;
  });

  return expanded.join(' ');
}

/**
 * Tokenize text into words, removing stopwords.
 *
 * @param text Text to tokenize (should be normalized first)
 * @returns Array of tokens
 */
export function tokenize(text: string): string[] {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return words.filter(word => !STOPWORDS.has(word));
}

/**
 * Tokenize text and map synonyms to canonical forms.
 *
 * @param text Text to tokenize (should be normalized first)
 * @returns Array of canonical tokens
 */
export function tokenizeWithSynonyms(text: string): string[] {
  const tokens = tokenize(text);
  return tokens.map(token => SYNONYM_MAP.get(token) || token);
}

/**
 * Extract year references from text.
 *
 * @param text Text to search
 * @returns Array of years found (e.g., [2024, 2025])
 */
export function extractYears(text: string): number[] {
  const matches = text.match(/\b(20[0-9]{2})\b/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => parseInt(m, 10)))];
}

/**
 * Extract month references from text.
 *
 * @param text Text to search (should be normalized)
 * @returns Array of month numbers (1-12)
 */
export function extractMonths(text: string): number[] {
  const monthPatterns: [RegExp, number][] = [
    [/\bjanuary\b|\bjan\b/, 1],
    [/\bfebruary\b|\bfeb\b/, 2],
    [/\bmarch\b|\bmar\b/, 3],
    [/\bapril\b|\bapr\b/, 4],
    [/\bmay\b/, 5],
    [/\bjune\b|\bjun\b/, 6],
    [/\bjuly\b|\bjul\b/, 7],
    [/\baugust\b|\baug\b/, 8],
    [/\bseptember\b|\bsept?\b/, 9],
    [/\boctober\b|\boct\b/, 10],
    [/\bnovember\b|\bnov\b/, 11],
    [/\bdecember\b|\bdec\b/, 12],
  ];

  const months: number[] = [];
  for (const [pattern, month] of monthPatterns) {
    if (pattern.test(text)) {
      months.push(month);
    }
  }
  return months;
}

/**
 * Generate n-grams from tokens.
 *
 * @param tokens Array of tokens
 * @param n Size of n-gram (default: 2 for bigrams)
 * @returns Array of n-grams as joined strings
 */
export function generateNgrams(tokens: string[], n: number = 2): string[] {
  if (tokens.length < n) return [];

  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Extract significant tokens (length >= minLength, not stopwords).
 * Useful for blocking keys.
 *
 * @param text Normalized text
 * @param minLength Minimum token length (default: 4)
 * @returns Array of significant tokens
 */
export function extractSignificantTokens(text: string, minLength: number = 4): string[] {
  const tokens = tokenize(text);
  return tokens.filter(t => t.length >= minLength);
}

/**
 * Get the first non-stopword from text.
 *
 * @param text Normalized text
 * @returns First significant word or undefined
 */
export function getFirstSignificantWord(text: string): string | undefined {
  const tokens = tokenize(text);
  return tokens[0];
}

// ============ Contradiction Detection ============

/**
 * Contradictory word pairs - if one appears in text A and the other in text B,
 * the events are likely different.
 */
export const CONTRADICTIONS: [string, string][] = [
  // Actions
  ['cut', 'raise'], ['cut', 'increase'], ['lower', 'raise'],
  ['resign', 'pardon'], ['resign', 'impeach'], ['resign', 'fire'],
  ['win', 'lose'], ['wins', 'loses'],
  ['pass', 'fail'], ['approve', 'reject'], ['confirm', 'reject'],
  ['buy', 'sell'], ['long', 'short'],

  // Positions
  ['presidential', 'vice'], ['president', 'vp'],
  ['senate', 'house'],
  ['governor', 'senator'], ['governor', 'mayor'],

  // Comparisons
  ['above', 'below'], ['over', 'under'],
  ['more', 'less'], ['higher', 'lower'],
  ['yes', 'no'],

  // Directions
  ['increase', 'decrease'], ['up', 'down'],
  ['rise', 'fall'], ['grow', 'shrink'],
];

/**
 * Check if two texts contain contradictory words.
 *
 * @param textA First text
 * @param textB Second text
 * @returns true if contradiction found
 */
export function hasContradiction(textA: string, textB: string): boolean {
  const lowerA = textA.toLowerCase();
  const lowerB = textB.toLowerCase();

  for (const [wordA, wordB] of CONTRADICTIONS) {
    // Check if A contains wordA and B contains wordB (or vice versa)
    const aHasFirst = lowerA.includes(wordA);
    const aHasSecond = lowerA.includes(wordB);
    const bHasFirst = lowerB.includes(wordA);
    const bHasSecond = lowerB.includes(wordB);

    if ((aHasFirst && bHasSecond) || (aHasSecond && bHasFirst)) {
      return true;
    }
  }
  return false;
}

// ============ Entity Extraction ============

/**
 * Known entities (politicians, companies, etc.)
 */
const KNOWN_ENTITIES = [
  // US Politicians
  'trump', 'biden', 'harris', 'pence', 'obama', 'clinton',
  'desantis', 'newsom', 'vance', 'walz',
  'pelosi', 'mcconnell', 'schumer', 'johnson',

  // International
  'putin', 'zelensky', 'xi', 'modi', 'macron', 'trudeau',
  'netanyahu', 'musk', 'bezos', 'zuckerberg',

  // Companies
  'tesla', 'apple', 'google', 'amazon', 'microsoft', 'nvidia',
  'openai', 'anthropic', 'meta', 'twitter', 'spacex',

  // Sports teams
  'chiefs', 'eagles', 'patriots', 'cowboys', 'lakers', 'celtics',
];

/**
 * Extract named entities from text.
 *
 * @param text Text to search
 * @returns Array of entity names (lowercase)
 */
export function extractEntities(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  // Check known entities
  for (const entity of KNOWN_ENTITIES) {
    if (lower.includes(entity)) {
      found.push(entity);
    }
  }

  // Also extract capitalized words as potential entities
  // (catches names not in our list)
  const capitalizedPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  const matches = text.match(capitalizedPattern) || [];
  for (const match of matches) {
    const normalized = match.toLowerCase();
    // Skip common words and short matches
    if (!found.includes(normalized) &&
        normalized.length > 2 &&
        !STOPWORDS.has(normalized) &&
        !['will', 'who', 'what', 'when', 'where', 'how', 'the', 'yes', 'before', 'after'].includes(normalized)) {
      found.push(normalized);
    }
  }

  return [...new Set(found)]; // dedupe
}

// ============ Exports ============

export {
  STOPWORDS,
  ABBREVIATIONS,
  SYNONYM_GROUPS,
  SYNONYM_MAP,
  KNOWN_ENTITIES,
};
