import { create } from 'zustand';

export interface UserTeam {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
  conference: string;
  division: string;
}

interface GameState {
  currentSeason: number;
  userTeam: UserTeam | null;
  playoffsComplete: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
  simCount: number;
  commissionerMode: boolean;

  setCurrentSeason: (season: number) => void;
  setUserTeam: (team: UserTeam | null) => void;
  setPlayoffsComplete: (complete: boolean) => void;
  setDifficulty: (d: 'easy' | 'normal' | 'hard') => void;
  advanceSeason: (nextSeason: number) => void;
  incrementSimCount: () => void;
  setCommissionerMode: (v: boolean) => void;
}

export const useGameStore = create<GameState>((set) => ({
  currentSeason: 2025,
  userTeam: null,
  playoffsComplete: false,
  difficulty: 'normal',
  simCount: 0,
  commissionerMode: false,

  setCurrentSeason: (currentSeason) => set({ currentSeason }),
  setUserTeam: (userTeam) => set({ userTeam }),
  setPlayoffsComplete: (playoffsComplete) => set({ playoffsComplete }),
  setDifficulty: (difficulty) => set({ difficulty }),
  advanceSeason: (nextSeason) =>
    set({ currentSeason: nextSeason, playoffsComplete: false }),
  incrementSimCount: () => set((s) => ({ simCount: s.simCount + 1 })),
  setCommissionerMode: (commissionerMode) => set({ commissionerMode }),
}));
