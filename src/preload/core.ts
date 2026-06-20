import { ipcRenderer } from 'electron';

export const coreApi = {
  resetDynasty: () =>
    ipcRenderer.invoke('reset-dynasty'),

  resetSave: () =>
    ipcRenderer.invoke('reset-save'),

  checkSetupDone: () =>
    ipcRenderer.invoke('check-setup-done'),

  balanceRosters: () =>
    ipcRenderer.invoke('balance-rosters'),

  getUserTeam: () =>
    ipcRenderer.invoke('get-user-team'),

  setUserTeam: (teamId: number) =>
    ipcRenderer.invoke('set-user-team', teamId),

  getTeams: () =>
    ipcRenderer.invoke('get-teams'),

  getDifficulty: () =>
    ipcRenderer.invoke('get-difficulty'),

  setDifficulty: (level: string) =>
    ipcRenderer.invoke('set-difficulty', level),

  listSaves: (): Promise<Array<{ name: string; teamName: string | null; season: number | null; lastPlayed: string | null }>> =>
    ipcRenderer.invoke('list-saves'),

  openSave: (name: string): Promise<{ ok: boolean; meta: { name: string; teamName: string | null; season: number | null } }> =>
    ipcRenderer.invoke('open-save', name),

  deleteSave: (name: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('delete-save', name),

  editPlayer: (payload: {
    playerId: number;
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
  }) => ipcRenderer.invoke('edit-player', payload),
};
