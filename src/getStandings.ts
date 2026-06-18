import { db } from './database';

interface TeamRecord {
  id: number; city: string; name: string;
  conference: string; division: string;
  wins: number; losses: number; pct: string;
}

export interface PlayoffSeeds {
  AFC: TeamRecord[];
  NFC: TeamRecord[];
}

export function getStandings(season = 2024): TeamRecord[] {
  const teams = db.prepare('SELECT id, city, name, conference, division FROM teams').all() as TeamRecord[];
  return teams.map(team => {
    const wins = (db.prepare(`
      SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1
      AND ((home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score))
    `).get(season, team.id, team.id) as any).count as number;
    const losses = (db.prepare(`
      SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1
      AND ((home_team_id = ? AND home_score < away_score) OR (away_team_id = ? AND away_score < home_score))
    `).get(season, team.id, team.id) as any).count as number;
    const totalGames = wins + losses;
    return { ...team, wins, losses, pct: totalGames > 0 ? (wins / totalGames).toFixed(3) : '.000' };
  });
}

export function getPlayoffSeeds(season = 2024): PlayoffSeeds {
  const standings = getStandings(season);
  return {
    AFC: standings.filter(t => t.conference === 'AFC').sort((a, b) => b.wins - a.wins).slice(0, 7),
    NFC: standings.filter(t => t.conference === 'NFC').sort((a, b) => b.wins - a.wins).slice(0, 7),
  };
}
