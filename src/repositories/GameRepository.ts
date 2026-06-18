import { db } from '../database';

class GameRepository {
  countBySeason(season: number, playoff = false): number {
    const clause = playoff ? 'AND is_playoff = 1' : 'AND is_playoff = 0';
    return (db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? ${clause}`).get(season) as any).count;
  }

  getPendingByWeek(season: number, week: number): any[] {
    return db.prepare(
      `SELECT id, home_team_id, away_team_id FROM games WHERE season = ? AND week = ? AND is_simulated = 0 AND is_playoff = 0`
    ).all(season, week);
  }

  getCurrentWeek(season: number): number | null {
    const row = db.prepare(
      'SELECT MIN(week) as week FROM games WHERE season = ? AND is_simulated = 0 AND is_playoff = 0'
    ).get(season) as any;
    return row?.week ?? null;
  }

  countPendingInWeek(season: number, week: number): number {
    return (db.prepare(
      'SELECT COUNT(*) as cnt FROM games WHERE season = ? AND week = ? AND is_simulated = 0 AND is_playoff = 0'
    ).get(season, week) as any).cnt;
  }

  getTeamRecord(teamId: number, season: number): { wins: number; losses: number; ties: number } {
    const wins = (db.prepare(
      `SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score))`
    ).get(season, teamId, teamId) as any).count;
    const losses = (db.prepare(
      `SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score < away_score) OR (away_team_id = ? AND away_score < home_score))`
    ).get(season, teamId, teamId) as any).count;
    const ties = (db.prepare(
      `SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND (home_team_id = ? OR away_team_id = ?) AND home_score = away_score`
    ).get(season, teamId, teamId) as any).count;
    return { wins, losses, ties };
  }

  // Single query replacing N×3 getTeamRecord calls for full-season standings.
  getAllRecords(season: number): Record<number, { wins: number; losses: number; ties: number }> {
    const rows = db.prepare(`
      SELECT
        t.id AS team_id,
        SUM(CASE
          WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
            OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0
        END) AS wins,
        SUM(CASE
          WHEN (g.home_team_id = t.id AND g.home_score < g.away_score)
            OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0
        END) AS losses,
        SUM(CASE
          WHEN (g.home_team_id = t.id OR g.away_team_id = t.id)
            AND g.home_score = g.away_score THEN 1 ELSE 0
        END) AS ties
      FROM teams t
      LEFT JOIN games g
        ON (g.home_team_id = t.id OR g.away_team_id = t.id)
        AND g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
      GROUP BY t.id
    `).all(season) as any[];
    const map: Record<number, { wins: number; losses: number; ties: number }> = {};
    for (const r of rows) map[r.team_id] = { wins: r.wins ?? 0, losses: r.losses ?? 0, ties: r.ties ?? 0 };
    return map;
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
    db.prepare(
      'UPDATE games SET home_score = ?, away_score = ?, home_q1 = ?, home_q2 = ?, home_q3 = ?, home_q4 = ?, away_q1 = ?, away_q2 = ?, away_q3 = ?, away_q4 = ?, weather = ?, is_simulated = 1 WHERE id = ?'
    ).run(homeScore, awayScore, hq[0], hq[1], hq[2], hq[3], aq[0], aq[1], aq[2], aq[3], weather, gameId);
  }
}

export const gameRepo = new GameRepository();
