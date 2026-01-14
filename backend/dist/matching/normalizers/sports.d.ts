/**
 * Sports Team Normalizer
 *
 * Normalizes team names from both platforms to canonical names
 * for accurate market matching.
 */
export type League = 'nfl' | 'nba' | 'nhl' | 'mlb' | 'soccer';
/**
 * Extract and normalize team name from text.
 *
 * @param text The market question or outcome text
 * @param league The league to search in (nfl, nba, nhl, mlb, soccer)
 * @returns Canonical team name or null if not found
 */
export declare function normalizeTeamName(text: string, league: League): string | null;
/**
 * Get the league from an event name.
 */
export declare function detectLeague(eventName: string): League | null;
/**
 * Get all teams for a league.
 */
export declare function getLeagueTeams(league: League): string[];
/**
 * Check if two texts refer to the same team.
 */
export declare function isSameTeam(text1: string, text2: string, league: League): boolean;
