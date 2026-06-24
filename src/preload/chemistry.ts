import { ipcRenderer } from 'electron';

export interface ChemistryEvent {
  id: number;
  week: number;
  delta: number;
  reason: string;
}

export interface ArchetypeCount {
  archetype: string;
  count: number;
}

export interface TeamChemistryData {
  chemistry: number;
  events: ChemistryEvent[];
  archetypes: ArchetypeCount[];
}

export const chemistryApi = {
  getTeamChemistry: (teamId?: number): Promise<TeamChemistryData> =>
    ipcRenderer.invoke('get-team-chemistry', teamId),
  getPlayerArchetype: (playerId: number): Promise<string> =>
    ipcRenderer.invoke('get-player-archetype', playerId),
  setPlayerArchetype: (playerId: number, archetype: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('set-player-archetype', playerId, archetype),
};
