import { ipcRenderer } from 'electron';

export const tradesApi = {
  getTradeablePicks: (teamId: number) =>
    ipcRenderer.invoke('get-tradeable-picks', teamId),

  getCpuTradeOffer: () =>
    ipcRenderer.invoke('get-cpu-trade-offer'),

  setTeamTradeStatus: (payload: { teamId: number; status: string | null }) =>
    ipcRenderer.invoke('set-team-trade-status', payload),

  acceptCpuTradeOffer: (payload: { myPlayerId: number; theirPlayerId: number; theirTeamId: number; theirPickId: number | null }) =>
    ipcRenderer.invoke('accept-cpu-trade-offer', payload),

  proposeTrade: (payload: { myPlayerIds: number[]; theirPlayerIds: number[]; theirTeamId: number }) =>
    ipcRenderer.invoke('propose-trade', payload),

  getTeamNeeds: (teamId: number) =>
    ipcRenderer.invoke('get-team-needs', teamId),
};
