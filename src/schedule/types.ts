export interface Game {
  id: number;
  week: number;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
}

export interface BoxScoreGame {
  id: number; week: number;
  home_team: string; away_team: string;
  home_team_id: number; away_team_id: number;
  home_score: number; away_score: number;
  home_q1: number; home_q2: number; home_q3: number; home_q4: number;
  away_q1: number; away_q2: number; away_q3: number; away_q4: number;
}

export interface BoxScorePlayer {
  player_name: string; position: string; team_id: number;
  pass_attempts: number; completions: number; pass_yards: number; pass_tds: number; interceptions: number;
  rush_attempts: number; rush_yards: number; rush_tds: number;
  receptions: number; rec_yards: number; rec_tds: number; targets: number;
  tackles: number; assisted_tackles: number; sacks: number; tfl: number;
  def_interceptions: number; pass_deflections: number; def_tds: number;
  fg_made: number; fg_att: number; xp_made: number; xp_att: number;
}
