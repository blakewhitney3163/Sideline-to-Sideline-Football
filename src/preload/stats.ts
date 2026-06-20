import { ipcRenderer } from 'electron';

export const statsApi = {
  getStats: (season: number) =>
    ipcRenderer.invoke('get-stats', season),

  getPlayerStats: (playerId: number) =>
    ipcRenderer.invoke('get-player-stats', playerId),

  getPlayerCareerStats: (playerId: number) =>
    ipcRenderer.invoke('get-player-career-stats', playerId),

  getTeamStats: (teamId: number, season?: number) =>
    ipcRenderer.invoke('get-team-stats', teamId, season),

  getTeamSeasonStats: (season?: number) =>
    ipcRenderer.invoke('get-team-season-stats', season),

  getTeamNeeds: (teamId: number) =>
    ipcRenderer.invoke('get-team-needs', teamId),

  getNewsFeed: (opts?: { season?: number; category?: string; limit?: number }) =>
    ipcRenderer.invoke('get-news-feed', opts),

  getNewsSeasons: () =>
    ipcRenderer.invoke('get-news-seasons'),

  getHallOfFame: () =>
    ipcRenderer.invoke('get-hall-of-fame'),

  getAlltimeLeaders: () =>
    ipcRenderer.invoke('get-alltime-leaders'),

  getSeasonRecords: () =>
    ipcRenderer.invoke('get-season-records'),

  importHistoricalRecords: (recordType: 'alltime' | 'season') =>
    ipcRenderer.invoke('import-historical-records', recordType),

  importCustomTeams: () =>
    ipcRenderer.invoke('import-custom-teams'),

  importCustomPlayers: () =>
    ipcRenderer.invoke('import-custom-players'),
};
