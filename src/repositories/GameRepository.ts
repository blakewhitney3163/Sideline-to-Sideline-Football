const { db } = require('../database');

class GameRepository {
  countBySeason(season: number, playoff = false): number {
    const clause = playoff ? 'AND is_playoff = 1' : 'AND is_playoff = 0';
    return (db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? ${clause}`).get(season) as any).count;
  }

  getPendingByWeek(season: number, week: number): any[] {
    return db.prepare(`SELECT id, home_team_id, away_team_id FROM games WHERE season = ? AND week = ? AND is_simulated = 0 AND is_playoff = 0`).all(season, week);
  }

  getCurrentWeek(season: number): number | null {
    const row = db.prepare('SELECT MIN(week) as week FROM games WHERE season = ? AND is_simulated = 0 AND is_playoff = 0').get(season) as any;
    return row?.week ?? null;
  }

  countPendingInWeek(season: number, week: number): number {
    return (db.prepare('SELECT COUNT(*) as cnt FROM games WHERE season = ? AND week = ? AND is_simulated = 0 AND is_playoff = 0').get(season, week) as any).cnt;
  }

  getTeamRecord(teamId: number, season: number): { wins: number; losses: number; ties: number } {
    const wins = (db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score))`).get(season, teamId, teamId) as any).count;
    const losses = (db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score < away_score) OR (away_team_id = ? AND away_score < home_score))`).get(season, teamId, teamId) as any).count;
    const ties = (db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND (home_team_id = ? OR away_team_id = ?) AND home_score = away_score`).get(season, teamId, teamId) as any).count;
    return { wins, losses, ties };
  }

  getWinRecord(teamId: number, season: number): { wins: number; played: number } {
    const result = db.prepare(`
      SELECT
        SUM(CASE WHEN (home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END) as wins,
        COUNT(*) as played
      FROM games WHERE (home_team_id = ? OR away_team_id = ?) AND season = ? AND is_simulated = 1 AND is_playoff = 0
    `).get(teamId, teamId, teamId, teamId, season) as any;
    return { wins: result?.wins ?? 0, played: result?.played ?? 0 };
  }

  updateResult(gameId: number, homeScore: number, awayScore: number, hq: number[], aq: number[], weather: string): void {
    db.prepare('UPDATE games SET home_score = ?, away_score = ?, home_q1 = ?, home_q2 = ?, home_q3 = ?, home_q4 = ?, away_q1 = ?, away_q2 = ?, away_q3 = ?, away_q4 = ?, weather = ?, is_simulated = 1 WHERE id = ?')
      .run(homeScore, awayScore, hq[0], hq[1], hq[2], hq[3], aq[0], aq[1], aq[2], aq[3], weather, gameId);
  }
}

export const gameRepo = new GameRepository();
