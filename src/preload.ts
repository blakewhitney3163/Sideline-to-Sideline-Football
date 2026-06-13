import { contextBridge, ipcRenderer } from 'electron';

// Exposes a safe 'window.api' object to the React renderer process.
// Only methods explicitly listed here are accessible from the UI.
contextBridge.exposeInMainWorld('api', {

  // Fetch standings for a given season (defaults to 2024 in main process)
  getStandings: (season: number) =>
    ipcRenderer.invoke('get-standings', season),

  // Fetch all 32 teams
  getTeams: () =>
    ipcRenderer.invoke('get-teams'),

  // Fetch the full roster for a specific team by ID
  getRoster: (teamId: number) =>
    ipcRenderer.invoke('get-roster', teamId),

  //Fetch all games for a given season grouped by week
  getSchedule: (season: number) =>
    ipcRenderer.invoke('get-schedule', season),

  //Fetch dashboard summary data
  getDashboard: (season: number) =>
    ipcRenderer.invoke('get-dashboard', season),

});