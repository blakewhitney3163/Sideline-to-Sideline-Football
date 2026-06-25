import { db } from '../database';

export interface Scout {
  id: number;
  team_id: number | null;
  first_name: string;
  last_name: string;
  overall_rating: number;
  specialty: 'Offense' | 'Defense' | 'College' | 'National' | 'Regional';
  salary: number;
  years_on_staff: number;
}

class ScoutRepository {
  getByTeam(teamId: number): Scout[] {
    return db.prepare(
      'SELECT * FROM scouts WHERE team_id = ? ORDER BY overall_rating DESC'
    ).all(teamId) as Scout[];
  }

  getAvailable(): Scout[] {
    return db.prepare(
      'SELECT * FROM scouts WHERE team_id IS NULL ORDER BY overall_rating DESC'
    ).all() as Scout[];
  }

  getById(id: number): Scout | null {
    return db.prepare('SELECT * FROM scouts WHERE id = ?').get(id) as Scout | null;
  }

  create(
    teamId: number | null,
    firstName: string,
    lastName: string,
    overallRating: number,
    specialty: string,
    salary: number,
    yearsOnStaff: number
  ): void {
    db.prepare(`
      INSERT INTO scouts (team_id, first_name, last_name, overall_rating, specialty, salary, years_on_staff)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(teamId, firstName, lastName, overallRating, specialty, salary, yearsOnStaff);
  }

  assignToTeam(scoutId: number, teamId: number): void {
    db.prepare('UPDATE scouts SET team_id = ? WHERE id = ?').run(teamId, scoutId);
  }

  release(scoutId: number): void {
    db.prepare('UPDATE scouts SET team_id = NULL, years_on_staff = 0 WHERE id = ?').run(scoutId);
  }

  countAll(): number {
    return (db.prepare('SELECT COUNT(*) as cnt FROM scouts').get() as any).cnt;
  }

  countByTeam(teamId: number): number {
    return (db.prepare('SELECT COUNT(*) as cnt FROM scouts WHERE team_id = ?').get(teamId) as any).cnt;
  }

  countAvailable(): number {
    return (db.prepare('SELECT COUNT(*) as cnt FROM scouts WHERE team_id IS NULL').get() as any).cnt;
  }

  /** Weekly scouting points = sum of ceil(rating/15) for all team scouts. */
  getWeeklyPoints(teamId: number): number {
    const scouts = this.getByTeam(teamId);
    if (scouts.length === 0) return 1;
    return scouts.reduce((sum, s) => sum + Math.ceil(s.overall_rating / 15), 0);
  }

  incrementYearsOnStaff(teamId: number): void {
    db.prepare('UPDATE scouts SET years_on_staff = years_on_staff + 1 WHERE team_id = ?').run(teamId);
  }
}

export const scoutRepo = new ScoutRepository();
