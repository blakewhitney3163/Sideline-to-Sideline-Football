import { ipcMain } from 'electron';
import {
  getStaffByTeam, getAvailableCoaches, hireCoach, fireCoach, replenishCoachPool,
} from '../services/CoachingService';

export function registerCoachingHandlers(): void {
  ipcMain.handle('get-coaching-staff', (_event: any, teamId: number) =>
    getStaffByTeam(teamId));

  ipcMain.handle('get-available-coaches', (_event: any, role?: string) => {
    replenishCoachPool();
    return getAvailableCoaches(role);
  });

  ipcMain.handle('hire-coach', (_event: any, { teamId, coachId }: { teamId: number; coachId: number }) =>
    hireCoach(teamId, coachId));

  ipcMain.handle('fire-coach', (_event: any, coachId: number) =>
    fireCoach(coachId));
}
