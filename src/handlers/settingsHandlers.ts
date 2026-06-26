import { ipcMain } from 'electron';
import { db, generateContracts } from '../database';
import { balanceRosters } from '../helpers/balanceRosters';
import { settingsRepo } from '../repositories';
import type { IpcEvent, CountRow, CntRow } from '../types/ipc';

const DIFFICULTY_FACTORS: Record<string, number> = { easy: 8, normal: 0, hard: -8 };

export function getDifficulty(): string {
  return settingsRepo.get('difficulty') ?? 'normal';
}

export function getDifficultyFactor(): number {
  return DIFFICULTY_FACTORS[getDifficulty()] ?? 0;
}

interface PlayerOvrRow { id: number; overall_rating: number; }

export function registerSettingsHandlers(): void {

  ipcMain.handle('get-difficulty', () => getDifficulty());

  ipcMain.handle('set-difficulty', (_event: IpcEvent, level: string) => {
    if (!['easy', 'normal', 'hard'].includes(level)) return { success: false };
    settingsRepo.set('difficulty', level);
    return { success: true };
  });

  ipcMain.handle('get-user-team', () => settingsRepo.getUserTeam());

  ipcMain.handle('set-user-team', (_event: IpcEvent, teamId: number) => {
    settingsRepo.set('user_team_id', String(teamId));
    return { success: true };
  });

  ipcMain.handle('reset-dynasty', () => {
    const { generatePlayers } = require('../generatePlayers');
    db.prepare('DELETE FROM stats').run();
    db.prepare('DELETE FROM games').run();
    db.prepare('DELETE FROM champions').run();
    db.prepare('DELETE FROM contracts').run();
    db.prepare('DELETE FROM depth_chart').run();
    db.prepare('DELETE FROM draft_prospects').run();
    db.prepare('DELETE FROM career_stats_history').run();
    db.prepare('DELETE FROM player_milestones').run();
    db.prepare('DELETE FROM hall_of_fame').run();
    db.prepare('DELETE FROM news_events').run();
    db.prepare('DELETE FROM players').run();
    db.prepare('DELETE FROM owner_goals').run();
    db.prepare("DELETE FROM settings WHERE key LIKE 'scouting_budget_%'").run();
    db.prepare("DELETE FROM settings WHERE key = 'dynasty_template'").run();
    db.prepare("DELETE FROM settings WHERE key = 'owner_patience'").run();
    generatePlayers();
    db.prepare("UPDATE settings SET value = '2025' WHERE key = 'current_season'").run();
    generateContracts();
    balanceRosters();
    return { success: true };
  });

  ipcMain.handle('reset-save', () => {
    const { generatePlayers } = require('../generatePlayers');
    db.prepare("DELETE FROM settings WHERE key = 'user_team_id'").run();
    db.prepare('DELETE FROM stats').run();
    db.prepare('DELETE FROM games').run();
    db.prepare('DELETE FROM champions').run();
    db.prepare('DELETE FROM contracts').run();
    db.prepare('DELETE FROM depth_chart').run();
    db.prepare('DELETE FROM draft_prospects').run();
    db.prepare('DELETE FROM career_stats_history').run();
    db.prepare('DELETE FROM player_milestones').run();
    db.prepare('DELETE FROM hall_of_fame').run();
    db.prepare('DELETE FROM news_events').run();
    db.prepare('DELETE FROM players').run();
    db.prepare('DELETE FROM owner_goals').run();
    db.prepare("DELETE FROM settings WHERE key LIKE 'scouting_budget_%'").run();
    db.prepare("DELETE FROM settings WHERE key = 'owner_patience'").run();
    db.prepare("DELETE FROM settings WHERE key = 'dynasty_template'").run();
    generatePlayers();
    db.prepare("UPDATE settings SET value = '2025' WHERE key = 'current_season'").run();
    generateContracts();
    return { success: true };
  });

  ipcMain.handle('balance-rosters', () => {
    balanceRosters();
    const row = db.prepare('SELECT COUNT(*) as count FROM players WHERE is_free_agent = 1').get() as CountRow;
    return { success: true, freeAgents: row.count };
  });

  ipcMain.handle('check-setup-done', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM players').get() as CntRow;
    return row.cnt > 0;
  });

    ipcMain.handle('apply-dynasty-template', () => {
    const template = settingsRepo.get('dynasty_template');
    const teamIdStr = settingsRepo.get('user_team_id');
    if (!teamIdStr) return { success: false, reason: 'No user team set' };
    const teamId = parseInt(teamIdStr, 10);

    // Always clear coaches from user's team so they hire fresh in pre-season
    db.prepare('UPDATE coaching_staff SET team_id = NULL, years_remaining = 3 WHERE team_id = ?').run(teamId);

    if (!template) return { success: true };

    if (template === 'rebuild') {
      const players = db.prepare(
        "SELECT id, overall_rating FROM players WHERE team_id = ? AND roster_status = 'active'"
      ).all(teamId) as PlayerOvrRow[];
      for (const p of players) {
        const drop = Math.floor(Math.random() * 9) + 10;
        const newOvr = Math.max(50, p.overall_rating - drop);
        db.prepare('UPDATE players SET overall_rating = ? WHERE id = ?').run(newOvr, p.id);
      }
      db.prepare(
        'UPDATE contracts SET annual_salary = MAX(0.87, annual_salary * 0.55) WHERE team_id = ?'
      ).run(teamId);
    } else if (template === 'contender') {
      const players = db.prepare(
        "SELECT id, overall_rating FROM players WHERE team_id = ? AND roster_status = 'active' ORDER BY overall_rating ASC"
      ).all(teamId) as PlayerOvrRow[];
      const bottom = players.slice(0, Math.floor(players.length / 2));
      for (const p of bottom) {
        const drop = Math.floor(Math.random() * 5) + 2;
        const newOvr = Math.max(55, p.overall_rating - drop);
        db.prepare('UPDATE players SET overall_rating = ? WHERE id = ?').run(newOvr, p.id);
      }
      db.prepare(
        'UPDATE contracts SET annual_salary = MAX(0.87, annual_salary * 0.80) WHERE team_id = ?'
      ).run(teamId);
    } else if (template === 'dynasty') {
      const players = db.prepare(
        "SELECT id, overall_rating FROM players WHERE team_id = ? AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 15"
      ).all(teamId) as PlayerOvrRow[];
      for (const p of players) {
        const boost = Math.floor(Math.random() * 5) + 3;
        const newOvr = Math.min(99, p.overall_rating + boost);
        db.prepare('UPDATE players SET overall_rating = ? WHERE id = ?').run(newOvr, p.id);
      }
    }

    return { success: true };
  });

  ipcMain.handle('edit-player', (_event: IpcEvent, payload: {
    playerId: number;
    first_name?: string;
    last_name?: string;
    position?: string;
    position_label?: string;
    overall_rating?: number;
    age?: number;
    dev_trait?: string;
    speed?: number;
    strength?: number;
    awareness?: number;
    throw_accuracy?: number;
    throw_power?: number;
    catching?: number;
    route_running?: number;
    tackle_rating?: number;
    coverage?: number;
    pass_rush?: number;
    kickpower?: number;
    kickaccuracy?: number;
    runblocking?: number;
    passblocking?: number;
  }) => {
    const { playerId, ...fields } = payload;
    const ALLOWED = [
      'first_name', 'last_name', 'position', 'position_label',
      'overall_rating', 'age', 'dev_trait',
      'speed', 'strength', 'awareness',
      'throw_accuracy', 'throw_power',
      'catching', 'route_running',
      'tackle_rating', 'coverage', 'pass_rush',
      'kickpower', 'kickaccuracy',
      'runblocking', 'passblocking',
    ];
    const updates = Object.entries(fields).filter(([k, v]) => ALLOWED.includes(k) && v !== undefined);
    if (updates.length === 0) return { success: false, reason: 'No valid fields.' };
    const setClauses = updates.map(([k]) => `${k} = ?`).join(', ');
    const values = [...updates.map(([, v]) => v), playerId];
    db.prepare(`UPDATE players SET ${setClauses} WHERE id = ?`).run(...values);
    return { success: true };
  });

  ipcMain.handle('get-commissioner-mode', () => {
    return settingsRepo.get('commissioner_mode') === '1';
  });

  ipcMain.handle('set-commissioner-mode', (_event: IpcEvent, enabled: boolean) => {
    settingsRepo.set('commissioner_mode', enabled ? '1' : '0');
    return { success: true };
  });

  ipcMain.handle('set-setting', (_event: any, key: string, value: string) => {
    settingsRepo.set(key, value);
    return { success: true };
  });

  ipcMain.handle('get-setting', (_event: any, key: string) => {
    return settingsRepo.get(key) ?? null;
  });

  ipcMain.handle('edit-team', (_event: IpcEvent, payload: {
    teamId: number;
    city?: string;
    name?: string;
    abbreviation?: string;
    conference?: string;
    division?: string;
  }) => {
    const { teamId, ...fields } = payload;
    const ALLOWED = ['city', 'name', 'abbreviation', 'conference', 'division'];
    const updates = Object.entries(fields).filter(([k, v]) => ALLOWED.includes(k) && v !== undefined);
    if (updates.length === 0) return { success: false, reason: 'No valid fields.' };
    const setClauses = updates.map(([k]) => `${k} = ?`).join(', ');
    const values = [...updates.map(([, v]) => v), teamId];
    db.prepare(`UPDATE teams SET ${setClauses} WHERE id = ?`).run(...values);
    return { success: true };
  });
}
