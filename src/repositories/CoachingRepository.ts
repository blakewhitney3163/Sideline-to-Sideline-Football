import { db } from '../database';

export interface Coach {
  id: number;
  team_id: number | null;
  role: 'HC' | 'OC' | 'DC' | 'ST';
  first_name: string;
  last_name: string;
  overall_rating: number;
  offense_rating: number;
  defense_rating: number;
  development_rating: number;
  experience: number;
  salary: number;
  years_remaining: number;
}

class CoachingRepository {
  getByTeam(teamId: number): Coach[] {
    return db.prepare(`
      SELECT * FROM coaching_staff WHERE team_id = ?
      ORDER BY CASE role WHEN 'HC' THEN 0 WHEN 'OC' THEN 1 WHEN 'DC' THEN 2 ELSE 3 END
    `).all(teamId) as Coach[];
  }

  getAvailable(role?: string): Coach[] {
    if (role) {
      return db.prepare(
        "SELECT * FROM coaching_staff WHERE team_id IS NULL AND role = ? ORDER BY overall_rating DESC"
      ).all(role) as Coach[];
    }
    return db.prepare(
      "SELECT * FROM coaching_staff WHERE team_id IS NULL ORDER BY role, overall_rating DESC"
    ).all() as Coach[];
  }

  getById(id: number): Coach | null {
    return db.prepare('SELECT * FROM coaching_staff WHERE id = ?').get(id) as Coach | null;
  }

  getByTeamAndRole(teamId: number, role: string): Coach | null {
    return db.prepare(
      'SELECT * FROM coaching_staff WHERE team_id = ? AND role = ?'
    ).get(teamId, role) as Coach | null;
  }

  create(
    teamId: number | null, role: string, firstName: string, lastName: string,
    overallRating: number, offenseRating: number, defenseRating: number,
    developmentRating: number, experience: number, salary: number, yearsRemaining: number
  ): void {
    db.prepare(`
      INSERT INTO coaching_staff
        (team_id, role, first_name, last_name, overall_rating, offense_rating,
         defense_rating, development_rating, experience, salary, years_remaining)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(teamId, role, firstName, lastName, overallRating, offenseRating,
           defenseRating, developmentRating, experience, salary, yearsRemaining);
  }

  assignToTeam(coachId: number, teamId: number): void {
    db.prepare('UPDATE coaching_staff SET team_id = ? WHERE id = ?').run(teamId, coachId);
  }

  release(coachId: number): void {
    db.prepare('UPDATE coaching_staff SET team_id = NULL WHERE id = ?').run(coachId);
  }

  countAll(): number {
    return (db.prepare('SELECT COUNT(*) as cnt FROM coaching_staff').get() as any).cnt;
  }

  countAvailable(role: string): number {
    return (db.prepare(
      'SELECT COUNT(*) as cnt FROM coaching_staff WHERE team_id IS NULL AND role = ?'
    ).get(role) as any).cnt;
  }
}

export const coachingRepo = new CoachingRepository();
