import { ipcRenderer } from 'electron';

export const draftApi = {
  generateDraftClass: () =>
    ipcRenderer.invoke('generate-draft-class'),

  getDraftClass: () =>
    ipcRenderer.invoke('get-draft-class'),

  getDraftOrder: () =>
    ipcRenderer.invoke('get-draft-order'),

  getRoundPickOrder: (payload: { round: number }) =>
    ipcRenderer.invoke('get-round-pick-order', payload),

  makeDraftPick: (payload: { prospectId: number; teamId: number; round: number; pick: number }) =>
    ipcRenderer.invoke('make-draft-pick', payload),

  runCpuRound: (payload: { round: number; userTeamId: number }) =>
    ipcRenderer.invoke('run-cpu-round', payload),

  completeDraft: () =>
    ipcRenderer.invoke('complete-draft'),

  scoutProspect: (prospectId: number) =>
    ipcRenderer.invoke('scout-prospect', prospectId),

  getScoutCount: (): Promise<{ used: number; budget: number }> =>
    ipcRenderer.invoke('get-scout-count'),
};
