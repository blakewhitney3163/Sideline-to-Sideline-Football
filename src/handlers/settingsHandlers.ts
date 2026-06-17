import { ipcMain, app } from 'electron';
const { db, generateContracts } = require('../database');
const { importFromMadden } = require('../importfromMadden');
import { balanceRosters } from '../helpers/balanceRosters';

// ─── Difficulty ───────────────────────────────────────────────────────────────

const DIFFICULTY_FACTORS: Record<string, number> = { easy: 8, normal: 0, hard: -8 };

export function getDifficulty(): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'difficulty'").get() as any;
  return row?.value ?? 'normal';
}

export function getDifficultyFactor(): number {
  return DIFFICULTY_FACTORS[getDifficulty()] ?? 0;
}

export function registerSettingsHandlers(): void {

  ipcMain.handle('get-difficulty', () => getDifficulty());

  ipcMain.handle('set-difficulty', (_event: any, level: string) => {
    if (!['easy', 'normal', 'hard'].includes(level)) return { success: false };
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('difficulty', ?)").run(level);
    return { success: true };
  });

  ipcMain.handle('get-user-team', () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    if (!row) return null;
    const teamId = parseInt(row.value);
    return db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) ?? null;
  });

  ipcMain.handle('set-user-team', (_event: any, teamId: number) => {
    const existing = db.prepare("SELECT * FROM settings WHERE key = 'user_team_id'").get();
    if (existing) {
      db.prepare("UPDATE settings SET value = ? WHERE key = 'user_team_id'").run(String(teamId));
    } else {
      db.prepare("INSERT INTO settings (key, value) VALUES ('user_team_id', ?)").run(String(teamId));
    }
    return { success: true };
  });

  ipcMain.handle('reset-dynasty', () => {
    const pathModule = require('path');
    const csvPath = pathModule.join(app.getAppPath(), 'src', 'madden-ratings.csv');
    db.prepare('DELETE FROM stats').run();
    db.prepare('DELETE FROM games').run();
    db.prepare('DELETE FROM champions').run();
    db.prepare('DELETE FROM contracts').run();
    db.prepare('DELETE FROM depth_chart').run();
    db.prepare('DELETE FROM draft_prospects').run();
    db.prepare('DELETE FROM career_stats_history').run();
    importFromMadden(csvPath);
    db.prepare("UPDATE settings SET value = '2025' WHERE key = 'current_season'").run();
    generateContracts();
    balanceRosters();
    return { success: true };
  });

    ipcMain.handle('balance-rosters', () => {
    balanceRosters();
    const faCount = (db.prepare('SELECT COUNT(*) as count FROM players WHERE is_free_agent = 1').get() as any).count;
    return { success: true, freeAgents: faCount };
  });         
  
  ipcMain.handle('check-setup-done', () => {
    const cnt = (db.prepare('SELECT COUNT(*) as cnt FROM career_stats_history').get() as any).cnt;
    return cnt > 0;
  });

  ipcMain.handle('reset-save', () => {
    const pathModule = require('path');
    const csvPath = pathModule.join(app.getAppPath(), 'src', 'madden-ratings.csv');
    db.prepare("DELETE FROM settings WHERE key = 'user_team_id'").run();
    db.prepare('DELETE FROM stats').run();
    db.prepare('DELETE FROM games').run();
    db.prepare('DELETE FROM champions').run();
    db.prepare('DELETE FROM contracts').run();
    db.prepare('DELETE FROM depth_chart').run();
    db.prepare('DELETE FROM draft_prospects').run();
    db.prepare('DELETE FROM career_stats_history').run();
    importFromMadden(csvPath);
    db.prepare("UPDATE settings SET value = '2025' WHERE key = 'current_season'").run();
    generateContracts();
    return { success: true };
  });
}
