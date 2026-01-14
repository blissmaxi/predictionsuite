/**
 * Sports Team Normalizer
 *
 * Normalizes team names from both platforms to canonical names
 * for accurate market matching.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// ============ Config Loading ============
let cachedTeams = null;
function loadTeams() {
    if (cachedTeams)
        return cachedTeams;
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const configPath = join(__dirname, '../../../config/teams.json');
    const content = readFileSync(configPath, 'utf-8');
    cachedTeams = JSON.parse(content);
    return cachedTeams;
}
// ============ Normalization ============
/**
 * Extract and normalize team name from text.
 *
 * @param text The market question or outcome text
 * @param league The league to search in (nfl, nba, nhl, mlb, soccer)
 * @returns Canonical team name or null if not found
 */
export function normalizeTeamName(text, league) {
    const teams = loadTeams();
    const leagueTeams = teams[league];
    if (!leagueTeams)
        return null;
    const lower = text.toLowerCase();
    // First pass: check for exact canonical name match
    for (const canonical of Object.keys(leagueTeams)) {
        if (lower.includes(canonical)) {
            return canonical;
        }
    }
    // Second pass: check aliases (sorted by length descending for best match)
    const allMatches = [];
    for (const [canonical, aliases] of Object.entries(leagueTeams)) {
        for (const alias of aliases) {
            const idx = lower.indexOf(alias.toLowerCase());
            if (idx !== -1) {
                allMatches.push({ canonical, alias, index: idx });
            }
        }
    }
    if (allMatches.length === 0)
        return null;
    // Prefer longer aliases (more specific matches)
    allMatches.sort((a, b) => b.alias.length - a.alias.length);
    return allMatches[0].canonical;
}
/**
 * Get the league from an event name.
 */
export function detectLeague(eventName) {
    const lower = eventName.toLowerCase();
    if (lower.includes('super bowl') || lower.includes('nfl'))
        return 'nfl';
    if (lower.includes('nba') || lower.includes('basketball'))
        return 'nba';
    if (lower.includes('nhl') || lower.includes('stanley cup') || lower.includes('hockey'))
        return 'nhl';
    if (lower.includes('mlb') || lower.includes('world series') || lower.includes('baseball'))
        return 'mlb';
    if (lower.includes('uefa') || lower.includes('champions league') || lower.includes('premier league'))
        return 'soccer';
    return null;
}
/**
 * Get all teams for a league.
 */
export function getLeagueTeams(league) {
    const teams = loadTeams();
    return Object.keys(teams[league] || {});
}
/**
 * Check if two texts refer to the same team.
 */
export function isSameTeam(text1, text2, league) {
    const team1 = normalizeTeamName(text1, league);
    const team2 = normalizeTeamName(text2, league);
    if (!team1 || !team2)
        return false;
    return team1 === team2;
}
