import { ipcMain } from 'electron';
import type { IpcEvent } from '../types/ipc';
import { settingsRepo } from '../repositories';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import {
  getTeamChemistry,
  getRecentChemistryEvents,
  processMoraleDrag,
} from '../services/ChemistryService';

export function registerChemistryHandlers(): void {

  ipcMain.handle('get-team-chemistry', (_event: IpcEvent, teamId?: number) => {
    const id = teamId ?? settingsRepo.getUserTeamId() ?? -1;
    const season = getCurrentSeason();
    return {
      chemistry: getTeamChemistry(id),
      events: getRecentChemistryEvents(id, season, 6),
    };
  });

  ipcMain.handle('process-morale-drag', (_event: IpcEvent, week: number) => {
    const teamId = settingsRepo.getUserTeamId() ?? -1;
    if (teamId < 0) return;
    processMoraleDrag(teamId, getCurrentSeason(), week);
  });
}
