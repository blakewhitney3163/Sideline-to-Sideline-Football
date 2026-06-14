import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {

  resetDynasty: () =>
  ipcRenderer.invoke('reset-dynasty'),

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

  getPlayerCareerStats: (playerId: number) =>
    ipcRenderer.invoke('get-player-career-stats', playerId),

  simulatePlayoffs: (season: number) =>
    ipcRenderer.invoke('simulate-playoffs', season),

  getPlayoffs: (season: number) =>
    ipcRenderer.invoke('get-playoffs', season),

  getChampions: () =>
    ipcRenderer.invoke('get-champions'),

  getSeasons: () =>
    ipcRenderer.invoke('get-seasons'),

  getCurrentSeason: () =>
    ipcRenderer.invoke('get-current-season'),

  advanceSeason: () =>
    ipcRenderer.invoke('advance-season'),

  // Week-by-week simulation
  generateSchedule: () =>
    ipcRenderer.invoke('generate-schedule'),

  getCurrentWeek: () =>
    ipcRenderer.invoke('get-current-week'),

  getWeekMatchups: (week: number) =>
    ipcRenderer.invoke('get-week-matchups', week),

  simulateWeek: (week: number) =>
    ipcRenderer.invoke('simulate-week', week),

  getGameBoxScore: (gameId: number) =>
    ipcRenderer.invoke('get-game-box-score', gameId),

});