/**
 * NBA Market Matcher
 *
 * Matches NBA game markets between Polymarket and Kalshi.
 * Handles the complexity of team name parsing, price mapping, and token ID assignment.
 */

import type { MarketPair, MarketData } from './market-matcher.js';
import type { NbaGameMatch } from './nba-game-matcher.js';

/**
 * Match NBA game markets between Polymarket and Kalshi.
 *
 * Finds the moneyline (winner) market on Polymarket and matches it
 * with the corresponding team markets on Kalshi.
 */
export function matchNbaGameMarkets(
  polyMarkets: MarketData[],
  kalshiMarkets: MarketData[],
  game: NbaGameMatch,
  imageUrl?: string,
  polymarketSlug?: string
): MarketPair[] {
  const pairs: MarketPair[] = [];

  const polyMoneyline = findPolymarketMoneyline(polyMarkets);
  if (!polyMoneyline) return pairs;

  const awayMarket = kalshiMarkets.find((m) =>
    m.ticker?.endsWith(`-${game.awayCode.toUpperCase()}`)
  );
  const homeMarket = kalshiMarkets.find((m) =>
    m.ticker?.endsWith(`-${game.homeCode.toUpperCase()}`)
  );

  if (!awayMarket || !homeMarket) return pairs;

  const { awayIsFirst, awayPolyYes, homePolyYes } = determineTeamPrices(polyMoneyline, game);
  const { awayTokenIds, homeTokenIds } = assignTokenIds(polyMoneyline.tokenIds, awayIsFirst);

  // Away team pair
  pairs.push(createTeamPair(
    game.awayTeam,
    game,
    awayPolyYes,
    awayMarket,
    awayTokenIds,
    imageUrl,
    polymarketSlug,
    polyMoneyline.endDate
  ));

  // Home team pair
  pairs.push(createTeamPair(
    game.homeTeam,
    game,
    homePolyYes,
    homeMarket,
    homeTokenIds,
    imageUrl,
    polymarketSlug,
    polyMoneyline.endDate
  ));

  return pairs;
}

// ============ Helper Functions ============

function hasWord(text: string, word: string): boolean {
  const regex = new RegExp(`\\b${word}\\b`, 'i');
  return regex.test(text);
}

/**
 * Find the full-game moneyline market (excludes props, spreads, totals, periods).
 */
function findPolymarketMoneyline(markets: MarketData[]): MarketData | undefined {
  return markets.find((m) => {
    const q = m.question?.toLowerCase() || '';
    return (
      q.includes('vs.') &&
      // Exclude spread/totals/props
      !q.includes('spread') &&
      !q.includes('o/u') &&
      !hasWord(q, 'over') &&
      !hasWord(q, 'under') &&
      !q.includes('total') &&
      !q.includes('points') &&
      !q.includes('rebounds') &&
      !q.includes('assists') &&
      !q.includes('steals') &&
      !q.includes('blocks') &&
      !hasWord(q, 'three') &&
      !q.includes('3-pointer') &&
      // Exclude period-specific markets
      !q.includes('quarter') &&
      !q.includes('half') &&
      !q.includes('1st') &&
      !q.includes('2nd') &&
      !q.includes('3rd') &&
      !q.includes('4th') &&
      !hasWord(q, 'first') &&
      !hasWord(q, 'second') &&
      !q.includes('1h') &&
      !q.includes('2h') &&
      !q.includes('moneyline')
    );
  });
}

/**
 * Find team position in question text.
 */
function findTeamPosition(
  question: string,
  team: string,
  city: string,
  nickname: string,
  code: string
): number {
  let pos = question.indexOf(team);
  if (pos >= 0) return pos;

  pos = question.indexOf(city);
  if (pos >= 0) return pos;

  pos = question.indexOf(nickname);
  if (pos >= 0) return pos;

  pos = question.indexOf(code.toLowerCase());
  if (pos >= 0) return pos;

  return -1;
}

/**
 * Determine which team appears first in the question and calculate prices.
 */
function determineTeamPrices(
  polyMoneyline: MarketData,
  game: NbaGameMatch
): { awayIsFirst: boolean; awayPolyYes: number; homePolyYes: number } {
  const question = polyMoneyline.question?.toLowerCase() || '';
  const awayTeamLower = game.awayTeam.toLowerCase();
  const homeTeamLower = game.homeTeam.toLowerCase();

  const awayParts = awayTeamLower.split(' ');
  const homeParts = homeTeamLower.split(' ');
  const awayCity = awayParts.slice(0, -1).join(' ');
  const homeCity = homeParts.slice(0, -1).join(' ');
  const awayNickname = awayParts[awayParts.length - 1];
  const homeNickname = homeParts[homeParts.length - 1];

  const awayPos = findTeamPosition(question, awayTeamLower, awayCity, awayNickname, game.awayCode);
  const homePos = findTeamPosition(question, homeTeamLower, homeCity, homeNickname, game.homeCode);

  let awayIsFirst: boolean;
  if (awayPos >= 0 && homePos >= 0) {
    awayIsFirst = awayPos < homePos;
  } else if (awayPos >= 0) {
    awayIsFirst = true;
  } else if (homePos >= 0) {
    awayIsFirst = false;
  } else {
    awayIsFirst = true; // Default assumption
  }

  let awayPolyYes: number;
  let homePolyYes: number;

  if (awayIsFirst) {
    awayPolyYes = polyMoneyline.yesPrice;
    homePolyYes = 1 - polyMoneyline.yesPrice;
  } else {
    homePolyYes = polyMoneyline.yesPrice;
    awayPolyYes = 1 - polyMoneyline.yesPrice;
  }

  return { awayIsFirst, awayPolyYes, homePolyYes };
}

/**
 * Assign token IDs based on team order in question.
 */
function assignTokenIds(
  originalTokenIds: string[] | undefined,
  awayIsFirst: boolean
): { awayTokenIds: string[] | undefined; homeTokenIds: string[] | undefined } {
  if (!originalTokenIds || originalTokenIds.length < 2) {
    return { awayTokenIds: undefined, homeTokenIds: undefined };
  }

  if (awayIsFirst) {
    return {
      awayTokenIds: [originalTokenIds[0], originalTokenIds[1]],
      homeTokenIds: [originalTokenIds[1], originalTokenIds[0]],
    };
  } else {
    return {
      awayTokenIds: [originalTokenIds[1], originalTokenIds[0]],
      homeTokenIds: [originalTokenIds[0], originalTokenIds[1]],
    };
  }
}

/**
 * Create a MarketPair for a team.
 */
function createTeamPair(
  teamName: string,
  game: NbaGameMatch,
  polyYes: number,
  kalshiMarket: MarketData,
  tokenIds: string[] | undefined,
  imageUrl: string | undefined,
  polymarketSlug: string | undefined,
  endDate: string | undefined
): MarketPair {
  const polyNo = 1 - polyYes;
  const kalshiYes = kalshiMarket.yesPrice;
  const kalshiNo = 1 - kalshiYes;
  const spread = Math.abs(polyYes - kalshiYes);

  return {
    matchedEntity: teamName,
    eventName: `NBA: ${game.awayCode.toUpperCase()} @ ${game.homeCode.toUpperCase()}`,
    category: 'nba_game',
    polymarket: {
      question: `${teamName} wins`,
      yesPrice: polyYes,
      noPrice: polyNo,
      tokenIds,
      slug: polymarketSlug,
      endDate,
    },
    kalshi: {
      question: kalshiMarket.question,
      yesPrice: kalshiYes,
      noPrice: kalshiNo,
      ticker: kalshiMarket.ticker,
      seriesTicker: 'KXNBAGAME',
      imageUrl,
      endDate: kalshiMarket.endDate,
    },
    confidence: 1.0,
    spread,
  };
}
