import { ipcMain } from 'electron';
import type { IpcEvent } from '../types/ipc';
import {
  getStaffByTeam, getAvailableCoaches, hireCoach, fireCoach, replenishCoachPool,
} from '../services/CoachingService';

export function registerCoachingHandlers(): void {
  ipcMain.handle('get-coaching-staff', (_event: IpcEvent, teamId: number) =>
    getStaffByTeam(teamId));

  ipcMain.handle('get-available-coaches', (_event: IpcEvent, role?: string) => {
    replenishCoachPool();
    return getAvailableCoaches(role);
  });

  ipcMain.handle('hire-coach', (_event: IpcEvent, { teamId, coachId }: { teamId: number; coachId: number }) =>
    hireCoach(teamId, coachId));

  ipcMain.handle('fire-coach', (_event: IpcEvent, coachId: number) =>
    fireCoach(coachId));
}
