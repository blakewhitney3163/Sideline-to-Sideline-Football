import { ipcRenderer } from 'electron';

export const chemistryApi = {
  getTeamChemistry: (teamId?: number): Promise<{ chemistry: number; events: { id: number; week: number; delta: number; reason: string }[] }> =>
    ipcRenderer.invoke('get-team-chemistry', teamId),
};
