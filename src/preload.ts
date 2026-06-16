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

  // Contracts & Roster
  getTeamContracts: (teamId: number) =>
    ipcRenderer.invoke('get-team-contracts', teamId),

  getPracticeSquad: (teamId: number) =>
    ipcRenderer.invoke('get-practice-squad', teamId),

  getCapSummary: (teamId: number) =>
    ipcRenderer.invoke('get-cap-summary', teamId),

  getRosterSpots: (teamId: number) =>
    ipcRenderer.invoke('get-roster-spots', teamId),

  getFreeAgents: (position?: string) =>
    ipcRenderer.invoke('get-free-agents', position),

  extendPlayer: (payload: { playerId: number; years: number; salary: number }) =>
    ipcRenderer.invoke('extend-player', payload),

  releasePlayer: (playerId: number) =>
    ipcRenderer.invoke('release-player', playerId),

  promoteFromPs: (playerId: number) =>
    ipcRenderer.invoke('promote-from-ps', playerId),

  signFreeAgent: (payload: { playerId: number; years: number; salary: number }) =>
    ipcRenderer.invoke('sign-free-agent', payload),

  importOtcContracts: (filePath?: string) =>
    ipcRenderer.invoke('import-otc-contracts', filePath),

  getExpiringContracts: () =>
    ipcRenderer.invoke('get-expiring-contracts'),

  resignPlayer: (payload: { playerId: number; years: number; salary: number }) =>
    ipcRenderer.invoke('resign-player', payload),

  getOffseasonStatus: () =>
    ipcRenderer.invoke('get-offseason-status'),

  // CPU Offseason AI
  cpuFaSigning: () =>
    ipcRenderer.invoke('cpu-fa-signing'),

  generateDraftClass: () =>
    ipcRenderer.invoke('generate-draft-class'),

  getDraftClass: () =>
    ipcRenderer.invoke('get-draft-class'),

  getDraftOrder: () =>
    ipcRenderer.invoke('get-draft-order'),

  makeDraftPick: (payload: { prospectId: number; teamId: number; round: number; pick: number }) =>
    ipcRenderer.invoke('make-draft-pick', payload),

  runCpuRound: (payload: { round: number; userTeamId: number }) =>
    ipcRenderer.invoke('run-cpu-round', payload),

  completeDraft: () =>
    ipcRenderer.invoke('complete-draft'),

  // Depth Chart
  getDepthChart: (teamId: number) =>
    ipcRenderer.invoke('get-depth-chart', teamId),

  setDepthChartOrder: (payload: { teamId: number; positionGroup: string; playerIds: number[] }) =>
    ipcRenderer.invoke('set-depth-chart-order', payload),

  resetDepthChart: (teamId: number) =>
    ipcRenderer.invoke('reset-depth-chart', teamId),

  importNflverseStats: () =>
    ipcRenderer.invoke('import-nflverse-stats'),

   checkSetupDone: () =>
    ipcRenderer.invoke('check-setup-done'),

  resetSave: () =>
    ipcRenderer.invoke('reset-save'),

  // Injuries
  getInjuryReport: (teamId: number) =>
    ipcRenderer.invoke('get-injury-report', teamId),

  // Historical Records
  getAlltimeLeaders: () =>
    ipcRenderer.invoke('get-alltime-leaders'),

  getSeasonRecords: () =>
    ipcRenderer.invoke('get-season-records'),

});