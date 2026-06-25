import { ipcRenderer } from 'electron';

export const gameprepApi = {
  setGameplan: (payload: { season: number; week: number; offense: string; defense: string }) =>
    ipcRenderer.invoke('set-gameplan', payload),

  getGameplan: (payload: { season: number; week: number }) =>
    ipcRenderer.invoke('get-gameplan', payload),

  scoutOpponent: (payload: { opponentTeamId: number; season: number; week: number }) =>
    ipcRenderer.invoke('scout-opponent', payload),

  isOpponentScouted: (payload: { season: number; week: number }) =>
    ipcRenderer.invoke('is-opponent-scouted', payload),

  getScouts: (teamId: number) =>
    ipcRenderer.invoke('get-scouts', teamId),

  getAvailableScouts: () =>
    ipcRenderer.invoke('get-available-scouts'),

  hireScout: (payload: { teamId: number; scoutId: number }) =>
    ipcRenderer.invoke('hire-scout', payload),

  fireScout: (scoutId: number) =>
    ipcRenderer.invoke('fire-scout', scoutId),

  getWeeklyScoutPts: (teamId: number) =>
    ipcRenderer.invoke('get-weekly-scout-pts', teamId),
};
