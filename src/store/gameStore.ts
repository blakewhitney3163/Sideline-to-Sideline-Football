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

  setCurrentSeason: (season: number) => void;
  setUserTeam: (team: UserTeam | null) => void;
  setPlayoffsComplete: (complete: boolean) => void;
  setDifficulty: (d: 'easy' | 'normal' | 'hard') => void;
  advanceSeason: (nextSeason: number) => void;
}

export const useGameStore = create<GameState>((set) => ({
  currentSeason: 2025,
  userTeam: null,
  playoffsComplete: false,
  difficulty: 'normal',

  setCurrentSeason: (currentSeason) => set({ currentSeason }),
  setUserTeam: (userTeam) => set({ userTeam }),
  setPlayoffsComplete: (playoffsComplete) => set({ playoffsComplete }),
  setDifficulty: (difficulty) => set({ difficulty }),
  advanceSeason: (nextSeason) =>
    set({ currentSeason: nextSeason, playoffsComplete: false }),
}));
