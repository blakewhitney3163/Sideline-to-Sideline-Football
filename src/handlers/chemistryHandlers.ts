import { ipcMain } from 'electron';
import type { IpcEvent } from '../types/ipc';
import { db } from '../database';
import { settingsRepo } from '../repositories';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import {
  getTeamChemistry,
  getRecentChemistryEvents,
  getTeamArchetypeBreakdown,
  processMoraleDrag,
} from '../services/ChemistryService';

export function registerChemistryHandlers(): void {

  ipcMain.handle('get-team-chemistry', (_event: IpcEvent, teamId?: number) => {
    const id = teamId ?? settingsRepo.getUserTeamId() ?? -1;
    const season = getCurrentSeason();
    return {
      chemistry: getTeamChemistry(id),
      events: getRecentChemistryEvents(id, season, 6),
      archetypes: getTeamArchetypeBreakdown(id),
    };
  });

  ipcMain.handle('process-morale-drag', (_event: IpcEvent, week: number) => {
    const teamId = settingsRepo.getUserTeamId() ?? -1;
    if (teamId < 0) return;
    processMoraleDrag(teamId, getCurrentSeason(), week);
  });

  ipcMain.handle('get-player-archetype', (_event: IpcEvent, playerId: number) => {
    try {
      const row = db.prepare('SELECT archetype FROM players WHERE id = ?').get(playerId) as any;
      return row?.archetype ?? 'normal';
    } catch { return 'normal'; }
  });

  ipcMain.handle('set-player-archetype', (_event: IpcEvent, playerId: number, archetype: string) => {
    const valid = ['normal', 'team_leader', 'vocal_leader', 'hard_worker', 'coachable', 'selfish', 'troublemaker'];
    if (!valid.includes(archetype)) return { success: false, error: 'Invalid archetype' };
    try {
      db.prepare('UPDATE players SET archetype = ? WHERE id = ?').run(archetype, playerId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
