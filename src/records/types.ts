export type RecordMode = 'alltime' | 'season' | 'awards' | 'hof' | 'franchise';
export type StatCategory = 'passing' | 'rushing' | 'receiving' | 'tds' | 'passTds' | 'tackles' | 'sacks' | 'defInts';

export interface RecordRow {
  player_id: number; player_name: string; position: string; team_name: string;
  age: number; overall_rating: number; dev_trait: string; season?: number;
  games_played: number; seasons_played?: number; is_historical?: boolean;
  pass_yards: number; pass_tds: number; interceptions: number;
  completions: number; pass_attempts: number;
  rush_yards: number; rush_tds: number; rush_attempts: number;
  rec_yards: number; rec_tds: number; receptions: number; targets: number;
  tackles: number; assisted_tackles: number; sacks: number; tfl: number;
  def_interceptions: number; pass_deflections: number; forced_fumbles: number;
}

export interface RecordsData {
  passing: RecordRow[]; rushing: RecordRow[]; receiving: RecordRow[];
  tds: RecordRow[]; passTds: RecordRow[];
  tackles: RecordRow[]; sacks: RecordRow[]; defInts: RecordRow[];
}

export interface AwardWinner {
  id: number; name: string; position: string; position_label: string;
  age: number; overall_rating: number; dev_trait: string;
  team_name: string; team_city: string; games: number;
  pass_yards?: number; pass_tds?: number; interceptions?: number;
  rush_yards?: number; rush_tds?: number;
  rec_yards?: number; rec_tds?: number; receptions?: number;
  tackles?: number; sacks?: number; def_interceptions?: number;
}

export interface SeasonAwards {
  mvp: AwardWinner | null; opoy: AwardWinner | null; dpoy: AwardWinner | null;
  oroty: AwardWinner | null; droty: AwardWinner | null;
  coy: { city: string; name: string; wins: number } | null;
}

export interface HofEntry {
  id: number; player_id: number; name: string; position: string;
  inducted_season: number; dev_trait: string; peak_ovr: number;
  career_games: number;
  career_pass_yards: number; career_pass_tds: number;
  career_rush_yards: number; career_rush_tds: number;
  career_rec_yards: number; career_rec_tds: number; career_receptions: number;
  career_tackles: number; career_sacks: number;
  career_def_ints: number; career_pass_deflections: number;
}
