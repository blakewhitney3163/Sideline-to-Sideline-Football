// ─── Salary Cap ───────────────────────────────────────────────────────────────

export const SALARY_CAP = 279.2;
export const SOFT_CAP_M = 275;
export const PS_MINIMUM_SALARY = 0.87;

// ─── Roster Limits ────────────────────────────────────────────────────────────

export const MAX_ACTIVE_ROSTER = 53;
export const MAX_PRACTICE_SQUAD = 16;

// ─── Season Rules ─────────────────────────────────────────────────────────────

export const TRADE_DEADLINE_WEEK = 8;
export const REGULAR_SEASON_WEEKS = 18;
export const PLAYOFF_WEEK_WILDCARD = 18;
export const PLAYOFF_WEEK_DIVISIONAL = 19;
export const PLAYOFF_WEEK_CHAMPIONSHIP = 20;
export const PLAYOFF_WEEK_SUPERBOWL = 21;
export const PLAYOFF_SEEDS_PER_CONFERENCE = 7;
export const ROOKIE_CONTRACT_YEARS = 4;
export const DRAFT_ROUNDS = 7;
export const DRAFT_CLASS_SIZE = 280;
export const MAX_SCOUTS = 25;

// ─── Position Mappings ────────────────────────────────────────────────────────

export const POSITION_TO_GROUP: Record<string, string> = {
  QB: 'QB',
  RB: 'RB', HB: 'RB', FB: 'RB',
  WR: 'WR',
  TE: 'TE',
  // OL — each position gets its own group
  LT: 'LT', LG: 'LG', C: 'C', RG: 'RG', RT: 'RT',
  OL: 'LT', // fallback for unlabeled OL players
  // DL — DE and DT are separate groups
  DE: 'DE', LE: 'DE', RE: 'DE',
  DT: 'DT', IDL: 'DT',
  DL: 'DE', // fallback for unlabeled DL players
  // LB — split into MLB and OLB
  MLB: 'MLB', MIKE: 'MLB', WILL: 'MLB',
  OLB: 'OLB', LOLB: 'OLB', ROLB: 'OLB',
  LB: 'MLB',  // fallback for unlabeled LB players
    // DB / K
  CB: 'CB',
  FS: 'FS', SS: 'SS', S: 'FS',   // S is fallback for unlabeled safeties
  K: 'K',
};

export const WAIVER_POS_MAX: Record<string, number> = {
  QB: 3, RB: 4, WR: 6, TE: 3, OL: 9, DL: 6, LB: 5, CB: 5, S: 4, K: 2,
};

export const MIN_CPU_ROSTER: Record<string, number> = {
  QB: 2, RB: 3, WR: 4, TE: 2, OL: 6, DL: 4, LB: 4, CB: 4, S: 2, K: 1,
};

// ─── Hall of Fame Thresholds ──────────────────────────────────────────────────

export const HOF_MIN_GAMES = 80;

export const HOF_THRESHOLDS: Record<string, { stat: string; value: number }[]> = {
  QB:  [{ stat: 'pass_yards', value: 25000 }, { stat: 'pass_tds', value: 150 }],
  RB:  [{ stat: 'rush_yards', value: 8000 },  { stat: 'rush_tds', value: 65 }],
  HB:  [{ stat: 'rush_yards', value: 8000 },  { stat: 'rush_tds', value: 65 }],
  WR:  [{ stat: 'rec_yards',  value: 7000 },  { stat: 'rec_tds', value: 50 }],
  TE:  [{ stat: 'rec_yards',  value: 6000 },  { stat: 'rec_tds', value: 45 }],
  DL:  [{ stat: 'sacks', value: 80 }],
  DE:  [{ stat: 'sacks', value: 80 }],
  LE:  [{ stat: 'sacks', value: 80 }],
  RE:  [{ stat: 'sacks', value: 80 }],
  DT:  [{ stat: 'sacks', value: 60 }],
  IDL: [{ stat: 'sacks', value: 60 }],
  LB:  [{ stat: 'tackles', value: 800 }, { stat: 'sacks', value: 60 }],
  MLB: [{ stat: 'tackles', value: 800 }, { stat: 'sacks', value: 60 }],
  OLB: [{ stat: 'tackles', value: 700 }, { stat: 'sacks', value: 70 }],
  CB:  [{ stat: 'def_interceptions', value: 25 }, { stat: 'pass_deflections', value: 80 }],
  S:   [{ stat: 'def_interceptions', value: 25 }, { stat: 'tackles', value: 700 }],
  FS:  [{ stat: 'def_interceptions', value: 25 }, { stat: 'tackles', value: 700 }],
  SS:  [{ stat: 'def_interceptions', value: 20 }, { stat: 'tackles', value: 750 }],
};
