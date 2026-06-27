import { ipcRenderer } from 'electron';

export const seasonApi = {
  getCurrentSeason: () =>
    ipcRenderer.invoke('get-current-season'),

  getSeasons: () =>
    ipcRenderer.invoke('get-seasons'),

  getStandings: (season: number) =>
    ipcRenderer.invoke('get-standings', season),

  getDashboard: (season: number) =>
    ipcRenderer.invoke('get-dashboard', season),

  getSchedule: (season: number) =>
    ipcRenderer.invoke('get-schedule', season),

  generateSchedule: () =>
    ipcRenderer.invoke('generate-schedule'),

  getCurrentWeek: () =>
    ipcRenderer.invoke('get-current-week'),

  getWeekMatchups: (week: number) =>
    ipcRenderer.invoke('get-week-matchups', week),

  simulateWeek: (week: number) =>
    ipcRenderer.invoke('simulate-week', week),

  simulateGame: (gameId: number) =>
    ipcRenderer.invoke('simulate-game', gameId),

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

  getOwnerGoals: (season: number) =>
    ipcRenderer.invoke('get-owner-goals', season),

  getOwnerPatience: () =>
    ipcRenderer.invoke('get-owner-patience'),

  generateOwnerGoals: () =>
    ipcRenderer.invoke('generate-owner-goals'),

  getLeagueOfficeData: () =>
    ipcRenderer.invoke('get-league-office-data'),

  castExpansionVote: (vote: 'for' | 'against') =>
    ipcRenderer.invoke('cast-expansion-vote', vote),

  getRelocationCities: () =>
    ipcRenderer.invoke('get-relocation-cities'),

  requestUserRelocation: (payload: { city: string; name: string; abbreviation: string; marketSize: string }) =>
    ipcRenderer.invoke('request-user-relocation', payload),

  getRecentLeagueEvents: () =>
    ipcRenderer.invoke('get-recent-league-events'),

  getAllGmPersonalities: () =>
    ipcRenderer.invoke('get-all-gm-personalities'),

  initPlayoffs: (season?: number) =>
    ipcRenderer.invoke('init-playoffs', season),

  getPlayoffState: (season?: number) =>
    ipcRenderer.invoke('get-playoff-state', season),

  simulatePlayoffGame: (gameId: number) =>
    ipcRenderer.invoke('simulate-playoff-game', gameId),
  getTeamPlayerGoals: (teamId: number, season: number) =>
    ipcRenderer.invoke('get-team-player-goals', teamId, season),

  generatePreseason: (season?: number) =>
    ipcRenderer.invoke('generate-preseason', season),

  getPreseasonStatus: (season?: number) =>
    ipcRenderer.invoke('get-preseason-status', season),

  simulatePreseasonGame: (gameId: number) =>
    ipcRenderer.invoke('simulate-preseason-game', gameId),

  simulatePreseasonWeek: (week: number, season?: number) =>
    ipcRenderer.invoke('simulate-preseason-week', week, season),

  buyStadiumUpgrade: (teamId: number) =>
    ipcRenderer.invoke('buy-stadium-upgrade', teamId),

};
