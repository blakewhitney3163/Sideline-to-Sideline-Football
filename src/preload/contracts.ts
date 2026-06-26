import { ipcRenderer } from 'electron';

export const contractsApi = {
  getTeamContracts: (teamId: number) =>
    ipcRenderer.invoke('get-team-contracts', teamId),

  getPracticeSquad: (teamId: number) =>
    ipcRenderer.invoke('get-practice-squad', teamId),

  getCapSummary: (teamId: number) =>
    ipcRenderer.invoke('get-cap-summary', teamId),

  getRosterSpots: (teamId: number) =>
    ipcRenderer.invoke('get-roster-spots', teamId),

  getExpiringContracts: () =>
    ipcRenderer.invoke('get-expiring-contracts'),

  getFreeAgents: (position?: string) =>
    ipcRenderer.invoke('get-free-agents', position),

  signFreeAgent: (payload: { playerId: number; years: number; salary: number }) =>
    ipcRenderer.invoke('sign-free-agent', payload),

  signFreeAgentToPs: (playerId: number) =>
    ipcRenderer.invoke('sign-free-agent-to-ps', playerId),

  resignPlayer: (payload: { playerId: number; years: number; salary: number }) =>
    ipcRenderer.invoke('resign-player', payload),

  extendPlayer: (payload: { playerId: number; years: number; salary: number }) =>
    ipcRenderer.invoke('extend-player', payload),

  restructurePlayer: (payload: { playerId: number; pct: number }) =>
    ipcRenderer.invoke('restructure-player', payload),

  releasePlayer: (playerId: number) =>
    ipcRenderer.invoke('release-player', playerId),

  promoteFromPs: (playerId: number) =>
    ipcRenderer.invoke('promote-from-ps', playerId),

  demoteToPs: (playerId: number) =>
    ipcRenderer.invoke('demote-to-ps', playerId),

  cutFromPs: (playerId: number) =>
    ipcRenderer.invoke('cut-from-ps', playerId),

  acceptCounterOffer: (payload: { playerId: number; years: number; salary: number }) =>
    ipcRenderer.invoke('accept-counter-offer', payload),

  applyFranchiseTag: (payload: { playerId: number; tagType: 'franchise' | 'transition' }) =>
    ipcRenderer.invoke('apply-franchise-tag', payload),

  removeFranchiseTag: (playerId: number) =>
    ipcRenderer.invoke('remove-franchise-tag', playerId),

  getDeadCap: (teamId: number) =>
    ipcRenderer.invoke('get-dead-cap', teamId),

  getOffseasonStatus: () =>
    ipcRenderer.invoke('get-offseason-status'),

  cpuFaSigning: () =>
    ipcRenderer.invoke('cpu-fa-signing'),

  openFreeAgency: () =>
    ipcRenderer.invoke('open-free-agency'),

  pickUpFifthYearOption: (playerId: number) =>
    ipcRenderer.invoke('pick-up-fifth-year-option', playerId),

  declineFifthYearOption: (playerId: number) =>
    ipcRenderer.invoke('decline-fifth-year-option', playerId),

  getHoldoutPlayers: () =>
    ipcRenderer.invoke('get-holdout-players'),

  resolveHoldout: (payload: { playerId: number; action: 'pay' | 'wait' | 'trade_request' }) =>
    ipcRenderer.invoke('resolve-holdout', payload),
};
