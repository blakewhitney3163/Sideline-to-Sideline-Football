import { db } from '../database';
import { getCurrentSeason } from '../helpers/getCurrentSeason';

export interface InjuryRecord {
  id: number;
  player_id: number;
  season: number;
  week: number;
  injury_type: string;
  severity: 'minor' | 'moderate' | 'severe';
  weeks_out: number;
}

export function severityFromWeeks(weeksOut: number): 'minor' | 'moderate' | 'severe' {
  if (weeksOut <= 2) return 'minor';
  if (weeksOut <= 5) return 'moderate';
  return 'severe';
}

export function recordInjuryHistory(
  injuredPlayers: Array<{
    id: number;
    weeks_out?: number;
    injury_type?: string;
  }>,
  week: number,
  season: number
): void {
  if (injuredPlayers.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO injury_history (player_id, season, week, injury_type, severity, weeks_out)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateProne = db.prepare(
    'UPDATE players SET injury_prone = 1 WHERE id = ?'
  );

  db.transaction(() => {
    for (const p of injuredPlayers) {
      const weeksOut = p.weeks_out ?? 1;
      const injuryType = p.injury_type ?? 'Injury';
      const severity = severityFromWeeks(weeksOut);
      insert.run(p.id, season, week, injuryType, severity, weeksOut);

      // Check if player now qualifies as injury-prone (2+ moderate/severe injuries)
      const significantCount = (db.prepare(`
        SELECT COUNT(*) as cnt FROM injury_history
        WHERE player_id = ? AND severity IN ('moderate', 'severe')
      `).get(p.id) as any)?.cnt ?? 0;

      if (significantCount >= 2) {
        updateProne.run(p.id);
      }
    }
  })();
}

export function getInjuryHistory(playerId: number): InjuryRecord[] {
  return db.prepare(`
    SELECT * FROM injury_history
    WHERE player_id = ?
    ORDER BY season DESC, week DESC
  `).all(playerId) as InjuryRecord[];
}

export function placeOnIR(playerId: number): { success: boolean; reason?: string } {
  const player = db.prepare(
    `SELECT id, first_name, last_name, injury_status, weeks_out FROM players WHERE id = ?`
  ).get(playerId) as any;

  if (!player) return { success: false, reason: 'Player not found.' };
  if (player.injury_status === 'ir') return { success: false, reason: 'Player is already on IR.' };
  if (player.injury_status === 'healthy' && (player.weeks_out ?? 0) === 0)
    return { success: false, reason: 'Player must be injured to place on IR.' };

  db.prepare(`UPDATE players SET injury_status = 'ir' WHERE id = ?`).run(playerId);
  return { success: true };
}

export function activateFromIR(playerId: number): { success: boolean; reason?: string } {
  const player = db.prepare(
    `SELECT id, first_name, last_name, injury_status, weeks_out FROM players WHERE id = ?`
  ).get(playerId) as any;

  if (!player) return { success: false, reason: 'Player not found.' };
  if (player.injury_status !== 'ir') return { success: false, reason: 'Player is not on IR.' };

  const weeksOut = player.weeks_out ?? 0;
  const newStatus = weeksOut > 0 ? 'out' : 'healthy';
  db.prepare(`UPDATE players SET injury_status = ? WHERE id = ?`).run(newStatus, playerId);
  return { success: true };
}

export function getTeamInjuries(teamId: number) {
  return db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait,
           p.injury_status, p.weeks_out, p.injury_type, p.injury_prone
    FROM players p
    WHERE p.team_id = ? AND p.injury_status != 'healthy'
    ORDER BY
      CASE p.injury_status WHEN 'ir' THEN 0 WHEN 'out' THEN 1 ELSE 2 END,
      p.overall_rating DESC
  `).all(teamId);
}
