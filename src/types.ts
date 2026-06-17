// ─── Primitive Types ──────────────────────────────────────────────────────────

export type DevTrait = 'Normal' | 'Star' | 'Superstar' | 'X-Factor';
export type RosterStatus = 'active' | 'practice_squad' | 'free_agent' | 'waivers' | 'retired';
export type InjuryStatus = 'healthy' | 'questionable' | 'out' | 'ir';
export type Conference = 'AFC' | 'NFC';
export type Division = 'North' | 'South' | 'East' | 'West';
export type ProgressionBracket = 'young' | 'rising' | 'prime' | 'decline' | 'old' | 'veteran';

// ─── Core Entities ────────────────────────────────────────────────────────────

export interface Player {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label?: string;
  age: number;
  overall_rating: number;
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
  dev_trait: DevTrait;
  roster_status: RosterStatus;
  is_free_agent: 0 | 1;
  team_id: number | null;
  injury_status?: InjuryStatus;
  weeks_out?: number;
  injury_type?: string | null;
  waived_by_team_id?: number | null;
  waiver_placed_week?: number | null;
}

export interface Team {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
  conference: Conference;
  division: Division;
}

export interface Contract {
  id: number;
  player_id: number;
  team_id: number;
  years_total: number;
  years_remaining: number;
  annual_salary: number;
  guaranteed_amount: number;
  guaranteed_pct: number;
}

export interface Game {
  id: number;
  season: number;
  week: number;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
  home_q1: number;
  home_q2: number;
  home_q3: number;
  home_q4: number;
  away_q1: number;
  away_q2: number;
  away_q3: number;
  away_q4: number;
  weather: string;
  is_playoff: 0 | 1;
  is_simulated: 0 | 1;
}

export interface PlayerStats {
  game_id: number;
  player_id: number;
  team_id: number;
  pass_attempts: number;
  completions: number;
  pass_yards: number;
  pass_tds: number;
  interceptions: number;
  rush_attempts: number;
  rush_yards: number;
  rush_tds: number;
  targets: number;
  receptions: number;
  rec_yards: number;
  rec_tds: number;
  tackles: number;
  assisted_tackles: number;
  sacks: number;
  tfl: number;
  forced_fumbles: number;
  fumble_recoveries: number;
  def_interceptions: number;
  pass_deflections: number;
  def_tds: number;
}

export interface CareerStats {
  player_id: number;
  season: number;
  games: number;
  completions: number;
  pass_attempts: number;
  pass_yards: number;
  pass_tds: number;
  interceptions: number;
  rush_attempts: number;
  rush_yards: number;
  rush_tds: number;
  targets: number;
  receptions: number;
  rec_yards: number;
  rec_tds: number;
  tackles: number;
  assisted_tackles: number;
  sacks: number;
  tfl: number;
  forced_fumbles: number;
  def_interceptions: number;
  pass_deflections: number;
  def_tds: number;
}

export interface DraftProspect {
  id: number;
  season: number;
  first_name: string;
  last_name: string;
  position: string;
  overall_rating: number;
  dev_trait: DevTrait;
  age: number;
  is_drafted: 0 | 1;
  draft_round?: number;
  draft_pick?: number;
  drafted_by_team_id?: number;
  scouted?: 0 | 1;
}

export interface PickAsset {
  id: number;
  owner_team_id: number;
  original_team_id: number;
  season: number;
  round: number;
  is_used: 0 | 1;
}

export interface HallOfFamer {
  id: number;
  player_id: number;
  name: string;
  position: string;
  inducted_season: number;
  dev_trait: DevTrait;
  peak_ovr: number;
  career_games: number;
  career_pass_yards: number;
  career_pass_tds: number;
  career_rush_yards: number;
  career_rush_tds: number;
  career_rec_yards: number;
  career_rec_tds: number;
  career_receptions: number;
  career_tackles: number;
  career_sacks: number;
  career_def_ints: number;
  career_pass_deflections: number;
}

// ─── IPC Result Types ─────────────────────────────────────────────────────────

export interface SuccessResult {
  success: boolean;
  reason?: string;
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

export interface TradeResult {
  accepted: boolean;
  reason?: string;
}

export interface InjuredPlayer {
  player_id: number;
  team_id: number;
  position: string;
  injury_status: string;
}

export interface Callup {
  name: string;
  position: string;
  teamName: string;
  isUserTeam: boolean;
}

export interface SimWeekResult {
  week: number;
  season: number;
  gamesSimulated: number;
  callups: Callup[];
  userPSOpenSpots: number;
}

export interface AdvanceSeasonResult {
  nextSeason: number;
  retired: { id: number; name: string; position: string; age: number; ovr: number }[];
  cpuResigns: number;
  breakouts: number;
  hofInductees: { name: string; position: string }[];
}
