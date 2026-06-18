export interface DepthPlayer {
  player_id: number;
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
  slot: number;
  position_group: string;
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
