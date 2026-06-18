export interface Prospect {
  id: number;
  season: number;
  first_name: string;
  last_name: string;
  position: string;
  overall_rating: number;
  dev_trait: string;
  age: number;
  is_drafted: number;
  draft_round: number | null;
  draft_pick: number | null;
  drafted_by_team_id: number | null;
  scouted: number;
}

export interface DraftTeam {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
  wins: number;
}

export interface PickSlot {
  slot: number;
  originalTeamId: number;
  ownerTeamId: number;
  ownerCity: string;
  ownerName: string;
  isTraded: boolean;
  isUsed: boolean;
  pickAssetId: number | null;
}

export interface MyPick {
  round: number;
  slot: number;
  player: Prospect;
  grade: string;
  gradeColor: string;
}

export interface CpuPick {
  round: number;
  pickInRound: number;
  teamId: number;
  prospect: Prospect;
}
