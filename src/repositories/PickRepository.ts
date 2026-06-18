import { db } from '../database';

class PickRepository {
  getByTeam(teamId: number, fromSeason: number): any[] {
    return db.prepare(`
      SELECT pa.id, pa.owner_team_id, pa.original_team_id, pa.season, pa.round,
             t.city AS original_team_city
      FROM pick_assets pa
      JOIN teams t ON t.id = pa.original_team_id
      WHERE pa.owner_team_id = ? AND pa.is_used = 0 AND pa.season >= ?
      ORDER BY pa.season, pa.round
    `).all(teamId, fromSeason);
  }

  getById(pickId: number, ownerTeamId: number): any | null {
    return db.prepare('SELECT round, season FROM pick_assets WHERE id = ? AND owner_team_id = ? AND is_used = 0').get(pickId, ownerTeamId) ?? null;
  }

  transfer(pickId: number, newTeamId: number): void {
    db.prepare('UPDATE pick_assets SET owner_team_id = ? WHERE id = ?').run(newTeamId, pickId);
  }

  markUsed(pickId: number): void {
    db.prepare('UPDATE pick_assets SET is_used = 1 WHERE id = ?').run(pickId);
  }

  findUnusedForRound(teamId: number, round: number, season: number): any | null {
    return db.prepare('SELECT id FROM pick_assets WHERE owner_team_id = ? AND round = ? AND season = ? AND is_used = 0 LIMIT 1').get(teamId, round, season) ?? null;
  }
}

export const pickRepo = new PickRepository();
