const { db } = require('../database');
import { Contract } from '../types';
import { PS_MINIMUM_SALARY } from '../constants';

class ContractRepository {
  getByTeam(teamId: number): any[] {
    return db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
             p.overall_rating, p.age, p.dev_trait, p.roster_status,
             c.annual_salary, c.years_remaining, c.years_total,
             c.guaranteed_amount, c.guaranteed_pct, c.id as contract_id
      FROM contracts c
      JOIN players p ON c.player_id = p.id
      WHERE c.team_id = ? AND p.roster_status = 'active'
      ORDER BY c.annual_salary DESC
    `).all(teamId);
  }

  getByPlayer(playerId: number): Contract | null {
    return db.prepare('SELECT * FROM contracts WHERE player_id = ?').get(playerId) as Contract ?? null;
  }

  getCapUsage(teamId: number): number {
    const result = db.prepare(`
      SELECT COALESCE(SUM(c.annual_salary), 0) as used_cap
      FROM contracts c
      JOIN players p ON c.player_id = p.id
      WHERE c.team_id = ? AND p.roster_status = 'active'
    `).get(teamId) as any;
    return Math.round(result.used_cap * 10) / 10;
  }

  getExpiring(teamId: number): any[] {
    return db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
             p.overall_rating, p.age, p.dev_trait,
             c.annual_salary, c.years_remaining, c.years_total,
             c.guaranteed_amount, c.guaranteed_pct, c.id as contract_id
      FROM contracts c
      JOIN players p ON c.player_id = p.id
      WHERE c.team_id = ? AND p.roster_status = 'active' AND c.years_remaining = 1
      ORDER BY c.annual_salary DESC
    `).all(teamId);
  }

  countExpiring(teamId: number): number {
    return (db.prepare(`
      SELECT COUNT(*) as count FROM contracts c
      JOIN players p ON c.player_id = p.id
      WHERE c.team_id = ? AND p.roster_status = 'active' AND c.years_remaining = 1
    `).get(teamId) as any).count;
  }

  create(playerId: number, teamId: number, years: number, salary: number, guaranteed: number, gtdPct: number): void {
    db.prepare(`INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(playerId, teamId, years, years, salary, guaranteed, gtdPct);
  }

  createPS(playerId: number, teamId: number): void {
    const existing = db.prepare('SELECT id FROM contracts WHERE player_id = ?').get(playerId);
    if (existing) {
      db.prepare('UPDATE contracts SET team_id = ?, years_total = 1, years_remaining = 1, annual_salary = ?, guaranteed_amount = 0, guaranteed_pct = 0 WHERE player_id = ?')
        .run(teamId, PS_MINIMUM_SALARY, playerId);
    } else {
      db.prepare('INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct) VALUES (?, ?, 1, 1, ?, 0, 0)')
        .run(playerId, teamId, PS_MINIMUM_SALARY);
    }
  }

  update(playerId: number, years: number, salary: number, guaranteed: number, gtdPct: number): void {
    db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
      .run(years, years, salary, guaranteed, gtdPct, playerId);
  }

  updateSalary(playerId: number, salary: number, guaranteed: number, gtdPct: number): void {
    db.prepare('UPDATE contracts SET annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
      .run(salary, guaranteed, gtdPct, playerId);
  }

  updateTeam(playerId: number, teamId: number): void {
    db.prepare('UPDATE contracts SET team_id = ? WHERE player_id = ?').run(teamId, playerId);
  }

  delete(playerId: number): void {
    db.prepare('DELETE FROM contracts WHERE player_id = ?').run(playerId);
  }

  decrementYears(): void {
    db.prepare('UPDATE contracts SET years_remaining = years_remaining - 1 WHERE years_remaining > 0').run();
  }
}

export const contractRepo = new ContractRepository();
