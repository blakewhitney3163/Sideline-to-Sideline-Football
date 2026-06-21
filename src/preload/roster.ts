import { ipcRenderer } from 'electron';

export const rosterApi = {
  getRoster: (teamId: number) =>
    ipcRenderer.invoke('get-roster', teamId),

  getTeamStatus: (teamId: number) =>
    ipcRenderer.invoke('get-team-status', teamId),

  getInjuryReport: (teamId: number) =>
    ipcRenderer.invoke('get-injury-report', teamId),

  getWaiverWire: () =>
    ipcRenderer.invoke('get-waiver-wire'),

  claimWaiver: (playerId: number) =>
    ipcRenderer.invoke('claim-waiver', playerId),

  getDepthChart: (teamId: number) =>
    ipcRenderer.invoke('get-depth-chart', teamId),

  setDepthChartOrder: (payload: { teamId: number; positionGroup: string; playerIds: number[] }) =>
    ipcRenderer.invoke('set-depth-chart-order', payload),

  resetDepthChart: (teamId: number) =>
    ipcRenderer.invoke('reset-depth-chart', teamId),

  getFranchiseHealth: (teamId: number) =>
    ipcRenderer.invoke('get-franchise-health', teamId),
  
  getTeamScheme: (teamId: number) =>
  ipcRenderer.invoke('get-team-scheme', teamId),
};
