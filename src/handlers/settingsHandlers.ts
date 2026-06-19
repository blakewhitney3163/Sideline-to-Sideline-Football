import { ipcMain } from 'electron';
import { db, generateContracts } from '../database';
import { balanceRosters } from '../helpers/balanceRosters';
import { settingsRepo } from '../repositories';

const DIFFICULTY_FACTORS: Record<string, number> = { easy: 8, normal: 0, hard: -8 };

export function getDifficulty(): string {
  return settingsRepo.get('difficulty') ?? 'normal';
}

export function getDifficultyFactor(): number {
  return DIFFICULTY_FACTORS[getDifficulty()] ?? 0;
}

export function registerSettingsHandlers(): void {

  ipcMain.handle('get-difficulty', () => getDifficulty());

  ipcMain.handle('set-difficulty', (_event: any, level: string) => {
    if (!['easy', 'normal', 'hard'].includes(level)) return { success: false };
    settingsRepo.set('difficulty', level);
    return { success: true };
  });

  ipcMain.handle('get-user-team', () => settingsRepo.getUserTeam());

  ipcMain.handle('set-user-team', (_event: any, teamId: number) => {
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
    generatePlayers();
    db.prepare("UPDATE settings SET value = '2025' WHERE key = 'current_season'").run();
    generateContracts();
    return { success: true };
  });

  ipcMain.handle('balance-rosters', () => {
    balanceRosters();
    const faCount = (db.prepare('SELECT COUNT(*) as count FROM players WHERE is_free_agent = 1').get() as any).count;
    return { success: true, freeAgents: faCount };
  });

  ipcMain.handle('check-setup-done', () => {
    const cnt = (db.prepare('SELECT COUNT(*) as cnt FROM players').get() as any).cnt;
    return cnt > 0;
  });
}
