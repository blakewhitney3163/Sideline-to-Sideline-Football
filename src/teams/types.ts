export interface Team {
  id: number;
  city: string;
  name: string;
  conference: string;
  division: string;
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
  speed: number;
  strength: number;
  awareness: number;
  throw_accuracy: number;
  throw_power: number;
  catching: number;
  route_running: number;
  tackle_rating: number;
  coverage: number;
  pass_rush: number;
  kickpower?: number;
  kickaccuracy?: number;
}

export interface PlayerStats {
  games: number;
  pass_attempts: number; completions: number; pass_yards: number; pass_tds: number; interceptions: number;
  rush_attempts: number; rush_yards: number; rush_tds: number;
  targets: number; receptions: number; rec_yards: number; rec_tds: number;
  tackles: number; assisted_tackles: number; sacks: number; tfl: number;
  def_interceptions: number; pass_deflections: number; forced_fumbles: number;
  fg_made: number; fg_att: number; xp_made: number; xp_att: number;
}

export interface CareerSeasonStats extends PlayerStats {
  season: number;
}

export type RatingCol = { label: string; key: keyof Player };
