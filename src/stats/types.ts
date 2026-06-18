export interface BasePlayer {
  player_id: number;
  player_name: string;
  team_name: string;
  overall_rating: number;
  age: number;
  position: string;
  dev_trait: string;
}

export interface PassingLeader extends BasePlayer {
  pass_yards: number;
  pass_tds: number;
  interceptions: number;
  completions: number;
  pass_attempts: number;
}

export interface RushingLeader extends BasePlayer {
  rush_yards: number;
  rush_tds: number;
  rush_attempts: number;
}

export interface ReceivingLeader extends BasePlayer {
  rec_yards: number;
  rec_tds: number;
  receptions: number;
  targets: number;
}

export interface TacklesLeader extends BasePlayer {
  tackles: number;
  assisted_tackles: number;
  sacks: number;
  tfl: number;
  forced_fumbles: number;
}

export interface SacksLeader extends BasePlayer {
  sacks: number;
  tfl: number;
  forced_fumbles: number;
  tackles: number;
}

export interface DefIntLeader extends BasePlayer {
  def_interceptions: number;
  pass_deflections: number;
  def_tds: number;
  tackles: number;
}

export interface KickerLeader extends BasePlayer {
  fg_made: number;
  fg_att: number;
  xp_made: number;
  xp_att: number;
}

export interface StatsData {
  passing: PassingLeader[];
  rushing: RushingLeader[];
  receiving: ReceivingLeader[];
  tackles: TacklesLeader[];
  sacks: SacksLeader[];
  defInterceptions: DefIntLeader[];
  kickers: KickerLeader[];
}

export interface SeasonStats {
  games: number;
  pass_yards: number;
  pass_tds: number;
  interceptions: number;
  completions: number;
  pass_attempts: number;
  rush_yards: number;
  rush_tds: number;
  rush_attempts: number;
  rec_yards: number;
  rec_tds: number;
  receptions: number;
  targets: number;
  tackles: number;
  assisted_tackles: number;
  sacks: number;
  tfl: number;
  def_interceptions: number;
  pass_deflections: number;
}

export interface CareerSeasonStats extends SeasonStats {
  season: number;
}

export interface SelectedPlayer {
  player_id: number;
  player_name: string;
  team_name: string;
  overall_rating: number;
  age: number;
  position: string;
  dev_trait: string;
}

export interface TeamEntry {
  id: number;
  city: string;
  name: string;
}

export type StatCategory = 'passing' | 'rushing' | 'receiving' | 'defense' | 'special_teams';
export type DefSubCat = 'tackles' | 'sacks' | 'interceptions';
