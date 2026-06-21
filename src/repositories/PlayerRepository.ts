import { db } from '../database';
import { Player, RosterStatus } from '../types';
import { PS_MINIMUM_SALARY } from '../constants';

class PlayerRepository {
  getById(id: number): Player | null {
    return db.prepare('SELECT * FROM players WHERE id = ?').get(id) as Player ?? null;
  }

  getByTeam(teamId: number, status?: RosterStatus): Player[] {
    if (status) {
      return db.prepare(`SELECT * FROM players WHERE team_id = ? AND roster_status = ? ORDER BY overall_rating DESC`).all(teamId, status) as Player[];
    }
    return db.prepare(`SELECT * FROM players WHERE team_id = ? ORDER BY overall_rating DESC`).all(teamId) as Player[];
  }

  getPracticeSquad(teamId: number): any[] {
    return db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
      p.overall_rating, p.age, p.dev_trait,
      c.annual_salary, c.years_remaining
      FROM players p
      LEFT JOIN contracts c ON c.player_id = p.id
      WHERE p.team_id = ? AND p.roster_status = 'practice_squad'
      ORDER BY p.overall_rating DESC
    `).all(teamId);
  }

  getFreeAgents(position?: string, limit: number = 200): any[] {
    const base = `
      SELECT id, first_name, last_name, position, position_label,
      overall_rating, age, dev_trait
      FROM players
      WHERE (is_free_agent = 1 OR roster_status = 'free_agent')
      AND roster_status != 'waivers'
      AND roster_status != 'retired'
      AND team_id IS NULL
    `;
    if (position && position !== 'ALL') {
      return db.prepare(`${base} AND (position = ? OR position_label = ?) ORDER BY overall_rating DESC LIMIT ?`)
        .all(position, position, limit);
    }
    return db.prepare(`${base} ORDER BY overall_rating DESC LIMIT ?`).all(limit);
  }

  getFranchiseHealth(teamId: number): {
    offense_ovr: number;
    defense_ovr: number;
    overall_ovr: number;
    groups: { group: string; avg_ovr: number; count: number }[];
  } {
    const rows = db.prepare(`
      SELECT position_label, overall_rating
      FROM players
      WHERE team_id = ? AND roster_status = 'active'
    `).all(teamId) as { position_label: string; overall_rating: number }[];

    const groupMap: Record<string, number[]> = {
      'QB': [], 'RB': [], 'WR/TE': [], 'OL': [], 'DL': [], 'LB': [], 'DB': [],
    };

    const offenseRatings: number[] = [];
    const defenseRatings: number[] = [];
    const offensePositions = new Set(['QB', 'RB', 'FB', 'WR', 'TE', 'SWR', 'LT', 'LG', 'C', 'RG', 'RT']);
    const defensePositions = new Set(['DE', 'DT', 'NT', 'MLB', 'OLB', 'ILB', 'EDGE', 'LB', 'CB', 'SS', 'FS', 'SCB']);

    for (const p of rows) {
      const pos = p.position_label ?? '';
      const ovr = p.overall_rating;
      if (pos === 'QB') groupMap['QB'].push(ovr);
      else if (['RB', 'FB'].includes(pos)) groupMap['RB'].push(ovr);
      else if (['WR', 'TE', 'SWR'].includes(pos)) groupMap['WR/TE'].push(ovr);
      else if (['LT', 'LG', 'C', 'RG', 'RT'].includes(pos)) groupMap['OL'].push(ovr);
      else if (['DE', 'DT', 'NT'].includes(pos)) groupMap['DL'].push(ovr);
      else if (['MLB', 'OLB', 'ILB', 'EDGE', 'LB'].includes(pos)) groupMap['LB'].push(ovr);
      else if (['CB', 'SS', 'FS', 'SCB'].includes(pos)) groupMap['DB'].push(ovr);

      if (offensePositions.has(pos)) offenseRatings.push(ovr);
      else if (defensePositions.has(pos)) defenseRatings.push(ovr);
    }

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const groups = Object.entries(groupMap)
      .filter(([, ratings]) => ratings.length > 0)
      .map(([group, ratings]) => ({ group, avg_ovr: avg(ratings), count: ratings.length }));

    return {
      offense_ovr: avg(offenseRatings),
      defense_ovr: avg(defenseRatings),
      overall_ovr: avg([...offenseRatings, ...defenseRatings]),
      groups,
    };
  }

  getOnWaivers(userTeamId?: number): any[] {
    const rows = db.prepare(`
      SELECT id, first_name, last_name, position, position_label,
      overall_rating, age, dev_trait, speed, strength, awareness, waived_by_team_id
      FROM players WHERE roster_status = 'waivers'
      ORDER BY overall_rating DESC
    `).all() as any[];
    if (userTeamId !== undefined) {
      return rows.map((p: any) => ({ ...p, canClaim: p.waived_by_team_id !== userTeamId }));
    }
    return rows;
  }

  getActiveCount(teamId: number): number {
    return (db.prepare("SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active'").get(teamId) as any).count;
  }

  getPSCount(teamId: number): number {
    return (db.prepare("SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'practice_squad'").get(teamId) as any).count;
  }

  getPSPromotionAlerts(teamId: number): {
  id: number; first_name: string; last_name: string;
  position: string; position_label: string;
  ps_ovr: number; lowest_active_ovr: number;
}[] {
  return db.prepare(`
    SELECT
      ps.id,
      ps.first_name,
      ps.last_name,
      ps.position,
      ps.position_label,
      ps.overall_rating AS ps_ovr,
      MIN(a.overall_rating) AS lowest_active_ovr
    FROM players ps
    JOIN players a
      ON a.team_id = ps.team_id
      AND a.position = ps.position
      AND a.roster_status = 'active'
    WHERE ps.team_id = ?
      AND ps.roster_status = 'practice_squad'
    GROUP BY ps.id
    HAVING ps.overall_rating > MIN(a.overall_rating)
    ORDER BY (ps.overall_rating - MIN(a.overall_rating)) DESC
  `).all(teamId) as any[];
}

  getCountByStatus(teamId: number): { active: number; ps: number } {
    const counts = db.prepare(`SELECT roster_status, COUNT(*) as count FROM players WHERE team_id = ? GROUP BY roster_status`).all(teamId) as any[];
    const active = counts.find((r: any) => r.roster_status === 'active')?.count ?? 0;
    const ps = counts.find((r: any) => r.roster_status === 'practice_squad')?.count ?? 0;
    return { active, ps };
  }

  updateTeam(playerId: number, teamId: number | null): void {
    db.prepare('UPDATE players SET team_id = ? WHERE id = ?').run(teamId, playerId);
  }

  updateRosterStatus(playerId: number, status: RosterStatus): void {
    db.prepare('UPDATE players SET roster_status = ? WHERE id = ?').run(status, playerId);
  }

  activate(playerId: number, teamId: number): void {
    db.prepare("UPDATE players SET team_id = ?, is_free_agent = 0, roster_status = 'active' WHERE id = ?").run(teamId, playerId);
  }

  assignToPS(playerId: number, teamId: number): void {
    db.prepare("UPDATE players SET team_id = ?, roster_status = 'practice_squad', is_free_agent = 0 WHERE id = ?").run(teamId, playerId);
  }

  releaseToWaivers(playerId: number, releasingTeamId: number | null, week: number): void {
    db.prepare("UPDATE players SET team_id = NULL, is_free_agent = 0, roster_status = 'waivers', waived_by_team_id = ?, waiver_placed_week = ? WHERE id = ?")
      .run(releasingTeamId, week, playerId);
  }

  releaseToFA(playerId: number): void {
    db.prepare("UPDATE players SET team_id = NULL, is_free_agent = 1, roster_status = 'free_agent', waived_by_team_id = NULL, waiver_placed_week = NULL WHERE id = ?")
      .run(playerId);
  }

  updateInjury(playerId: number, status: string, weeksOut: number, injuryType: string): void {
    db.prepare("UPDATE players SET injury_status = ?, weeks_out = ?, injury_type = ? WHERE id = ?")
      .run(status, weeksOut, injuryType, playerId);
  }

  advanceInjuryTimers(): void {
    db.prepare("UPDATE players SET weeks_out = MAX(0, weeks_out - 1) WHERE weeks_out > 0").run();
    db.prepare("UPDATE players SET injury_status = 'healthy', injury_type = NULL WHERE weeks_out = 0 AND injury_status != 'healthy'").run();
  }
}

export const playerRepo = new PlayerRepository();
