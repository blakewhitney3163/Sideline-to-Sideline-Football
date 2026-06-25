import { ipcRenderer } from 'electron';

export const coreApi = {
  resetDynasty: () =>
    ipcRenderer.invoke('reset-dynasty'),

  resetSave: () =>
    ipcRenderer.invoke('reset-save'),

  checkSetupDone: () =>
    ipcRenderer.invoke('check-setup-done'),

  balanceRosters: () =>
    ipcRenderer.invoke('balance-rosters'),

  getUserTeam: () =>
    ipcRenderer.invoke('get-user-team'),

  setUserTeam: (teamId: number) =>
    ipcRenderer.invoke('set-user-team', teamId),

  getTeams: () =>
    ipcRenderer.invoke('get-teams'),

  getDifficulty: () =>
    ipcRenderer.invoke('get-difficulty'),

  getTeamFinances:    (teamId: number) => ipcRenderer.invoke('get-team-finances', teamId),
getAllTeamFinances:  () => ipcRenderer.invoke('get-all-team-finances'),

  setDifficulty: (level: string) =>
    ipcRenderer.invoke('set-difficulty', level),

  listSaves: (): Promise<Array<{ name: string; teamName: string | null; season: number | null; lastPlayed: string | null }>> =>
    ipcRenderer.invoke('list-saves'),

  openSave: (name: string): Promise<{ ok: boolean; meta: { name: string; teamName: string | null; season: number | null } }> =>
    ipcRenderer.invoke('open-save', name),

  deleteSave: (name: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('delete-save', name),

  editPlayer: (payload: {
    playerId: number;
    first_name?: string;
    last_name?: string;
    position?: string;
    position_label?: string;
    overall_rating?: number;
    age?: number;
    dev_trait?: string;
    speed?: number;
    strength?: number;
    awareness?: number;
    throw_accuracy?: number;
    throw_power?: number;
    catching?: number;
    route_running?: number;
    tackle_rating?: number;
    coverage?: number;
    pass_rush?: number;
    kickpower?: number;
    kickaccuracy?: number;
    runblocking?: number;
    passblocking?: number;
  }) => ipcRenderer.invoke('edit-player', payload),

  editPlayerContract: (payload: {
    playerId: number;
    annual_salary: number;
    years_remaining: number;
  }) => ipcRenderer.invoke('edit-player-contract', payload),

  getCommissionerMode: (): Promise<boolean> =>
    ipcRenderer.invoke('get-commissioner-mode'),

  setCommissionerMode: (enabled: boolean) =>
    ipcRenderer.invoke('set-commissioner-mode', enabled),

    setSetting: (key: string, value: string) =>
    ipcRenderer.invoke('set-setting', key, value),

  getSetting: (key: string) =>
    ipcRenderer.invoke('get-setting', key),

  applyDynastyTemplate: () =>
    ipcRenderer.invoke('apply-dynasty-template'),

  editTeam: (payload: {
    teamId: number;
    city?: string;
    name?: string;
    abbreviation?: string;
    conference?: string;
    division?: string;
  }) => ipcRenderer.invoke('edit-team', payload),
};
