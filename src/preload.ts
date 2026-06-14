import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {

  resetDynasty: () =>
    ipcRenderer.invoke('reset-dynasty'),

  getPlayoffSeeds: () =>
    ipcRenderer.invoke('get-playoff-seeds'),

  getUserTeam: () =>
    ipcRenderer.invoke('get-user-team'),

  setUserTeam: (teamId: number) =>
    ipcRenderer.invoke('set-user-team', teamId),

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

  getTeamStatus: (teamId: number) =>
    ipcRenderer.invoke('get-team-status', teamId),

  proposeTrade: (payload: { myPlayerIds: number[]; theirPlayerIds: number[]; theirTeamId: number }) =>
    ipcRenderer.invoke('propose-trade', payload),

  seedDevTraits: () =>
    ipcRenderer.invoke('seed-dev-traits'),

  // Contracts
  getTeamContracts: (teamId: number) =>
    ipcRenderer.invoke('get-team-contracts', teamId),

  getCapSummary: (teamId: number) =>
    ipcRenderer.invoke('get-cap-summary', teamId),

  extendPlayer: (payload: { playerId: number; years: number; salary: number }) =>
    ipcRenderer.invoke('extend-player', payload),

  releasePlayer: (playerId: number) =>
    ipcRenderer.invoke('release-player', playerId),

  importOtcContracts: (filePath?: string) =>
    ipcRenderer.invoke('import-otc-contracts', filePath),

});