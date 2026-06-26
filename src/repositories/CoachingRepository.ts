import { db } from '../database';

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
// ... assignToTeam now accepts yearsRemaining; release clears it; decrementContracts() added
