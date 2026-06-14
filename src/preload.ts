import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {

  getStandings: (season: number) =>
    ipcRenderer.invoke('get-standings', season),

  getTeams: () =>
    ipcRenderer.invoke('get-teams'),

  getRoster: (teamId: number) =>
    ipcRenderer.invoke('get-roster', teamId),

  getSchedule: (season: number) =>
    ipcRenderer.invoke('get-schedule', season),

  getDashboard: (season: number) =>
    ipcRenderer.invoke('get-dashboard', season),

  getStats: (season: number) =>
    ipcRenderer.invoke('get-stats', season),

  getPlayerStats: (playerId: number) =>
    ipcRenderer.invoke('get-player-stats', playerId),

  simulatePlayoffs: (season: number) =>
    ipcRenderer.invoke('simulate-playoffs', season),

  getPlayoffs: (season: number) =>
    ipcRenderer.invoke('get-playoffs', season),

  getCurrentSeason: () =>
    ipcRenderer.invoke('get-current-season'),

  advanceSeason: () =>
    ipcRenderer.invoke('advance-season'),

});