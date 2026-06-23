export interface Contract {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
  annual_salary: number;
  years_remaining: number;
  years_total: number;
  guaranteed_amount: number;
  guaranteed_pct: number;
  contract_id: number;
  morale?: number;
  franchise_tagged?: number;
}

export interface PracticePlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
  annual_salary: number;
  years_remaining: number;
}

export interface FreeAgent {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
}

export interface CapSummary {
  total_cap: number;
  used_cap: number;
  available_cap: number;
}

export interface RosterSpots {
  active: number;
  ps: number;
  activeMax: number;
  psMax: number;
  activeFree: number;
  psFree: number;
}

export type Decision = 'pending' | 'resigned' | 'walking';

export interface Coach {
  id: number;
  team_id: number | null;
  role: 'HC' | 'OC' | 'DC' | 'ST';
  first_name: string;
  last_name: string;
  overall_rating: number;
  offense_rating: number;
  defense_rating: number;
  development_rating: number;
  experience: number;
  salary: number;
  years_remaining: number;
}

export interface WaiverPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  age: number;
  dev_trait: string;
  speed: number;
  strength: number;
  awareness: number;
  waived_by_team_id: number | null;
  canClaim: boolean;
}
