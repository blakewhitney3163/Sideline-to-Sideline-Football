import { ipcRenderer } from 'electron';

export const seasonApi = {
  getCurrentSeason: () =>
    ipcRenderer.invoke('get-current-season'),

  getSeasons: () =>
    ipcRenderer.invoke('get-seasons'),

  advanceSeason: () =>
    ipcRenderer.invoke('advance-season'),

  getStandings: (season: number) =>
    ipcRenderer.invoke('get-standings', season),

  getDashboard: (season: number) =>
    ipcRenderer.invoke('get-dashboard', season),

  generateSchedule: () =>
    ipcRenderer.invoke('generate-schedule'),

  getSchedule: (season: number) =>
    ipcRenderer.invoke('get-schedule', season),

  getCurrentWeek: () =>
    ipcRenderer.invoke('get-current-week'),

  getWeekMatchups: (week: number) =>
    ipcRenderer.invoke('get-week-matchups', week),

  simulateWeek: (week: number) =>
    ipcRenderer.invoke('simulate-week', week),

  simulateOneGame: (gameId: number) =>
    ipcRenderer.invoke('simulate-game', gameId),

  getGameBoxScore: (gameId: number) =>
    ipcRenderer.invoke('get-game-box-score', gameId),

  simulatePlayoffs: (season: number) =>
    ipcRenderer.invoke('simulate-playoffs', season),

  getPlayoffs: (season: number) =>
    ipcRenderer.invoke('get-playoffs', season),

  getPlayoffSeeds: () =>
    ipcRenderer.invoke('get-playoff-seeds'),

  getAnnouncingRetirements: () =>
  ipcRenderer.invoke('get-announcing-retirements'),

makeRetentionOffer: (playerId: number) =>
  ipcRenderer.invoke('make-retention-offer', playerId),

dismissRetirement: (playerId: number) =>
  ipcRenderer.invoke('dismiss-retirement', playerId),

  getChampions: () =>
    ipcRenderer.invoke('get-champions'),

  getSeasonAwards: (season: number) =>
    ipcRenderer.invoke('get-season-awards', season),
};
