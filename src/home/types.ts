export interface Matchup {
  id: number;
  week: number;
  home_team: string;
  away_team: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  is_simulated: number;
}

export interface BoxScorePlayer {
  player_name: string;
  position: string;
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
}

export interface BoxScoreData {
  game: {
    id: number;
    home_score: number;
    away_score: number;
    home_team: string;
    away_team: string;
    home_team_id: number;
    away_team_id: number;
  };
  players: BoxScorePlayer[];
}

export interface StandingEntry {
  team_name: string;
  wins: number;
  losses: number;
}

export interface Champion {
  season: number;
  team_name: string;
  conference: string;
}

export interface SeedEntry {
  id: number;
  city: string;
  name: string;
  team_name: string;
  wins: number;
  losses: number;
}

export interface PlayoffGame {
  week: number;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
}

export interface InjuredPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  position_label: string;
  overall_rating: number;
  injury_status: string;
  weeks_out: number;
  injury_type: string;
}

export interface UserTeam {
  id: number;
  city: string;
  name: string;
  abbreviation: string;
}
