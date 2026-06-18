export interface Team {
  id: number;
  city: string;
  name: string;
  conference: string;
}

export interface Player {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
}

export interface DraftPick {
  id: number;
  owner_team_id: number;
  original_team_id: number;
  season: number;
  round: number;
  original_team_city: string;
}

export interface TeamStatus {
  status: string;
  description: string;
  acceptanceThreshold: number;
  wins: number;
  losses: number;
  avgOverall: number;
  isOverridden: boolean;
}

export interface CpuOffer {
  fromTeamId: number;
  fromTeamName: string;
  requestedPlayer: Player;
  requestedValue: number;
  offeredPlayer: Player;
  offeredPick: DraftPick | null;
  offerValue: number;
}

export interface TeamNeed {
  position: string;
  severity: 'critical' | 'depth';
}
