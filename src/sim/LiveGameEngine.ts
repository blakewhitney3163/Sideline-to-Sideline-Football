import { db } from '../database';
import { loadTeamData, computeTeamRatings, randomNormal } from './ratings';
import { generateDefensiveStats, generateKickerStats } from './stats';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LivePlayer {
  id: number;
  name: string;
  position: string;
  rating: number;
  depth_slot: number;
}

interface StatAccum {
  player_id: number;
  team_id: number;
  pass_attempts: number; completions: number; pass_yards: number; pass_tds: number; interceptions: number;
  rush_attempts: number; rush_yards: number; rush_tds: number;
  targets: number; receptions: number; rec_yards: number; rec_tds: number;
  fg_made: number; fg_att: number; xp_made: number; xp_att: number;
  tackles: number; assisted_tackles: number; sacks: number; tfl: number;
  forced_fumbles: number; fumble_recoveries: number;
  def_interceptions: number; pass_deflections: number; def_tds: number;
}

export interface PlayResult {
  type: string;           // 'run'|'pass'|'incomplete'|'sack'|'interception'|'fumble'|'touchdown'|'field_goal'|'field_goal_miss'|'punt'|'kickoff'|'extra_point'|'timeout'|'challenge'|'turnover_downs'|'quarter_end'|'game_over'
  yardsGained: number;
  description: string;
  quarter: number;
  clockSeconds: number;   // clock BEFORE this play
  playerName?: string;
  isScoring: boolean;
  homeScore: number;
  awayScore: number;
  down: number;
  yardsToGo: number;
  yardLine: number;
  possession: 'home' | 'away';
  clockUsed: number;
  firstDown?: boolean;
}

export interface LiveGameState {
  gameId: number;
  homeTeamId: number; awayTeamId: number;
  homeTeamName: string; awayTeamName: string;
  season: number; week: number;
  userTeamId: number;
  quarter: number;
  clockSeconds: number;
  possession: 'home' | 'away';
  yardLine: number;      // 1–99, from offensive team's own end zone
  down: number;
  yardsToGo: number;
  homeScore: number;
  awayScore: number;
  timeouts: { home: number; away: number };
  challenges: { home: number; away: number };
  done: boolean;
  kickoffNext: boolean;
  homeRatings: { offenseRating: number; defenseRating: number };
  awayRatings: { offenseRating: number; defenseRating: number };
  homePlayers: LivePlayer[];
  awayPlayers: LivePlayer[];
  playerStats: Record<number, StatAccum>;
  homeQBInts: number;
  awayQBInts: number;
  lastPlaySnapshot?: Partial<LiveGameState>;
}

export type UserDecision =
  | { type: 'fourth_down'; choice: 'go_for_it' | 'punt' | 'field_goal' }
  | { type: 'timeout' }
  | { type: 'challenge' }
  | null;

interface SimPlayResult {
  play: PlayResult;
  state: LiveGameState;
  awaitingDecision?: 'fourth_down';
}

// ─── In-Memory Game Store ─────────────────────────────────────────────────────

const activeGames = new Map<number, LiveGameState>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rn(mean: number, std: number): number {
  return randomNormal(mean, std);
}

function loadLivePlayers(teamId: number): LivePlayer[] {
  const rows = db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating,
           COALESCE(dc.slot, 99) as depth_slot
    FROM players p
    LEFT JOIN depth_chart dc ON dc.player_id = p.id AND dc.team_id = ?
    WHERE p.team_id = ? AND p.roster_status = 'active'
      AND p.injury_status NOT IN ('out', 'ir')
    ORDER BY COALESCE(dc.slot, 99), p.overall_rating DESC
  `).all(teamId, teamId) as any[];
  return rows.map(r => ({
    id: r.id,
    name: `${r.first_name} ${r.last_name}`,
    position: r.position,
    rating: r.overall_rating,
    depth_slot: r.depth_slot,
  }));
}

function ensureStat(state: LiveGameState, playerId: number, teamId: number): StatAccum {
  if (!state.playerStats[playerId]) {
    state.playerStats[playerId] = {
      player_id: playerId, team_id: teamId,
      pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
      rush_attempts: 0, rush_yards: 0, rush_tds: 0,
      targets: 0, receptions: 0, rec_yards: 0, rec_tds: 0,
      fg_made: 0, fg_att: 0, xp_made: 0, xp_att: 0,
      tackles: 0, assisted_tackles: 0, sacks: 0, tfl: 0,
      forced_fumbles: 0, fumble_recoveries: 0,
      def_interceptions: 0, pass_deflections: 0, def_tds: 0,
    };
  }
  return state.playerStats[playerId];
}

function byPos(players: LivePlayer[], ...positions: string[]): LivePlayer[] {
  return players
    .filter(p => positions.includes(p.position))
    .sort((a, b) => a.depth_slot - b.depth_slot || b.rating - a.rating);
}

function offPlayers(state: LiveGameState): LivePlayer[] {
  return state.possession === 'home' ? state.homePlayers : state.awayPlayers;
}
function defPlayers(state: LiveGameState): LivePlayer[] {
  return state.possession === 'home' ? state.awayPlayers : state.homePlayers;
}
function offRatings(state: LiveGameState) {
  return state.possession === 'home' ? state.homeRatings : state.awayRatings;
}
function defRatings(state: LiveGameState) {
  return state.possession === 'home' ? state.awayRatings : state.homeRatings;
}
function offTeamId(state: LiveGameState): number {
  return state.possession === 'home' ? state.homeTeamId : state.awayTeamId;
}
function isUserPossession(state: LiveGameState): boolean {
  return offTeamId(state) === state.userTeamId;
}
function flipPossession(p: 'home' | 'away'): 'home' | 'away' {
  return p === 'home' ? 'away' : 'home';
}

// Weighted random receiver (top receivers more likely to be targeted)
function pickReceiver(players: LivePlayer[]): LivePlayer | null {
  const pool = byPos(players, 'WR', 'TE', 'RB', 'HB').slice(0, 5);
  if (pool.length === 0) return null;
  const weights = pool.map((_, i) => Math.max(0.05, 1.0 - i * 0.18));
  const total = weights.reduce((s, w) => s + w, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[0];
}

// Field position description
function fieldDesc(yardLine: number, possession: 'home' | 'away', homeTeamName: string, awayTeamName: string): string {
  if (yardLine <= 50) return `own ${yardLine}`;
  const oppLine = 100 - yardLine;
  if (oppLine === 0) return 'goal line';
  return `opp ${oppLine}`;
}

// Advance clock; handle quarter transitions
function tickClock(state: LiveGameState, seconds: number): void {
  state.clockSeconds = Math.max(0, state.clockSeconds - seconds);
}

function downStr(down: number, ytg: number): string {
  const d = ['1st', '2nd', '3rd', '4th'][down - 1] ?? `${down}th`;
  return `${d} & ${ytg}`;
}

// ─── Play Executors ───────────────────────────────────────────────────────────

function executeKickoff(state: LiveGameState): PlayResult {
  const returnYards = Math.round(rn(21, 6));
  const startYardLine = Math.max(15, Math.min(35, 25 + returnYards - 21));

  const prevPoss = state.possession;
  state.possession = flipPossession(prevPoss);
  state.yardLine = startYardLine;
  state.down = 1;
  state.yardsToGo = 10;
  state.kickoffNext = false;

  const offName = state.possession === 'home' ? state.homeTeamName : state.awayTeamName;

  return {
    type: 'kickoff', yardsGained: 0,
    description: `Kickoff — ${offName} ball at their own ${startYardLine}`,
    quarter: state.quarter, clockSeconds: state.clockSeconds,
    isScoring: false, homeScore: state.homeScore, awayScore: state.awayScore,
    down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
    possession: state.possession, clockUsed: 0,
  };
}

function executeRun(state: LiveGameState): PlayResult {
  const off = offRatings(state);
  const def = defRatings(state);
  const players = offPlayers(state);
  const rb = byPos(players, 'RB', 'HB', 'FB')[0] ?? byPos(players, 'QB')[0] ?? null;
  const teamId = offTeamId(state);

  const ratingFactor = Math.pow(Math.max(0.5, off.offenseRating / def.defenseRating), 0.4);
  let yards = Math.round(rn(4.2, 4.5) * ratingFactor);
  yards = Math.max(-6, Math.min(65, yards));

  const isFumble = Math.random() < 0.008;
  const clockUsed = Math.round(Math.max(10, rn(30, 8)));

  if (rb && !isFumble) {
    const s = ensureStat(state, rb.id, teamId);
    s.rush_attempts++;
    s.rush_yards += Math.max(0, yards);
  }

  let description: string;
  let playType = 'run';

  if (isFumble) {
    playType = 'fumble';
    description = `${rb?.name ?? 'Ball carrier'} FUMBLES — turnover!`;
    if (rb) {
      const s = ensureStat(state, rb.id, teamId);
      s.rush_attempts++;
      s.forced_fumbles = (s.forced_fumbles ?? 0);
    }
  } else {
    const yStr = yards > 0 ? `${yards}` : `a loss of ${Math.abs(yards)}`;
    description = `${rb?.name ?? 'RB'} rushes for ${yStr} yard${yards !== 1 ? 's' : ''}`;
    if (yards >= 10) description += ' — big gain!';
  }

  tickClock(state, clockUsed);

  const firstDown = !isFumble && yards >= state.yardsToGo && state.yardLine + yards < 100;
  let newYardLine = state.yardLine + (isFumble ? 0 : yards);

  if (isFumble) {
    const oppDefPlayer = byPos(defPlayers(state), 'LB', 'DL', 'CB', 'S', 'DE')[0];
    if (oppDefPlayer) {
      const ds = ensureStat(state, oppDefPlayer.id, state.possession === 'home' ? state.awayTeamId : state.homeTeamId);
      ds.fumble_recoveries++;
    }
    state.possession = flipPossession(state.possession);
    state.yardLine = Math.max(1, Math.min(99, 100 - newYardLine));
    state.down = 1; state.yardsToGo = 10;
  } else if (newYardLine >= 100) {
    // Touchdown
    return scoretouchdown(state, rb?.name ?? 'RB', rb?.id, teamId, clockUsed, 'run', yards);
  } else if (firstDown) {
    state.yardLine = newYardLine;
    state.down = 1;
    state.yardsToGo = Math.min(10, 100 - newYardLine);
  } else if (state.down >= 4) {
    // Turnover on downs
    state.possession = flipPossession(state.possession);
    state.yardLine = Math.max(1, Math.min(99, 100 - newYardLine));
    state.down = 1; state.yardsToGo = 10;
    description += ' — no first down, turnover on downs';
    playType = 'turnover_downs';
  } else {
    state.yardLine = newYardLine;
    state.down++;
    state.yardsToGo -= yards;
  }

  return {
    type: playType, yardsGained: yards, description,
    quarter: state.quarter, clockSeconds: state.clockSeconds + clockUsed,
    playerName: rb?.name, isScoring: false,
    homeScore: state.homeScore, awayScore: state.awayScore,
    down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
    possession: state.possession, clockUsed, firstDown,
  };
}

function executePass(state: LiveGameState): PlayResult {
  const off = offRatings(state);
  const def = defRatings(state);
  const players = offPlayers(state);
  const qb = byPos(players, 'QB')[0] ?? null;
  const receiver = pickReceiver(players);
  const teamId = offTeamId(state);

  const ratingFactor = Math.pow(Math.max(0.5, off.offenseRating / def.defenseRating), 0.3);
  const completionRate = Math.max(0.3, Math.min(0.82, 0.62 * ratingFactor));

  const isComplete = Math.random() < completionRate;
  const isSack = !isComplete && Math.random() < 0.18;
  const isInterception = isComplete && Math.random() < Math.max(0.005, 0.012 * (def.defenseRating / off.offenseRating));

  let clockUsed: number;
  let yards = 0;
  let playType = 'incomplete';
  let description = '';

  if (qb) {
    const qs = ensureStat(state, qb.id, teamId);
    qs.pass_attempts++;
  }
  if (receiver) {
    const rs = ensureStat(state, receiver.id, teamId);
    rs.targets++;
  }

  if (isSack) {
    playType = 'sack';
    yards = -Math.round(rn(6, 3));
    yards = Math.max(-15, yards);
    clockUsed = Math.round(rn(8, 4));
    description = `${qb?.name ?? 'QB'} sacked for a loss of ${Math.abs(yards)}`;

    const defRusher = byPos(defPlayers(state), 'DL', 'DE', 'LB', 'OLB')[0];
    if (defRusher) {
      const ds = ensureStat(state, defRusher.id, state.possession === 'home' ? state.awayTeamId : state.homeTeamId);
      ds.sacks++; ds.tfl++;
    }
    if (qb) {
      const qs = ensureStat(state, qb.id, teamId);
      qs.rush_yards += yards; // sack counts as negative rush
    }
    tickClock(state, clockUsed);
    const newYardLine = Math.max(1, state.yardLine + yards);
    if (state.down >= 4) {
      state.possession = flipPossession(state.possession);
      state.yardLine = Math.max(1, Math.min(99, 100 - newYardLine));
      state.down = 1; state.yardsToGo = 10;
    } else {
      state.yardLine = newYardLine;
      state.down++;
      state.yardsToGo -= yards;
    }

  } else if (!isComplete) {
    playType = 'incomplete';
    clockUsed = 5;
    const routes = ['short right', 'short left', 'over the middle', 'deep right', 'deep left'];
    const r = routes[Math.floor(Math.random() * routes.length)];
    description = `${qb?.name ?? 'QB'} incomplete — pass ${r}${receiver ? ` to ${receiver.name}` : ''}`;
    tickClock(state, clockUsed);
    if (state.down >= 4) {
      state.possession = flipPossession(state.possession);
      state.yardLine = Math.max(1, Math.min(99, 100 - state.yardLine));
      state.down = 1; state.yardsToGo = 10;
      playType = 'turnover_downs';
      description += ' — turnover on downs';
    } else {
      state.down++;
    }

  } else if (isInterception) {
    playType = 'interception';
    clockUsed = Math.round(rn(8, 5));
    const retYards = Math.round(rn(12, 8));
    const defBack = byPos(defPlayers(state), 'CB', 'S', 'FS', 'SS', 'LB')[0];
    description = `INTERCEPTION — ${defBack?.name ?? 'Defender'} picks it off${retYards > 5 ? ` and returns it ${retYards} yards` : ''}`;

    if (qb) {
      const qs = ensureStat(state, qb.id, teamId);
      qs.interceptions++;
    }
    if (defBack) {
      const ds = ensureStat(state, defBack.id, state.possession === 'home' ? state.awayTeamId : state.homeTeamId);
      ds.def_interceptions++;
    }
    if (state.possession === 'home') state.homeQBInts++; else state.awayQBInts++;

    tickClock(state, clockUsed);
    const newYL = Math.max(1, Math.min(99, 100 - state.yardLine - retYards));
    state.possession = flipPossession(state.possession);
    state.yardLine = newYL;
    state.down = 1; state.yardsToGo = 10;

  } else {
    // Complete pass
    yards = Math.round(rn(7.5, 6) * ratingFactor);
    yards = Math.max(0, Math.min(75, yards));
    clockUsed = Math.round(Math.max(8, rn(28, 8)));

    if (qb) {
      const qs = ensureStat(state, qb.id, teamId);
      qs.completions++; qs.pass_yards += yards;
    }
    if (receiver) {
      const rs = ensureStat(state, receiver.id, teamId);
      rs.receptions++; rs.rec_yards += yards;
    }

    description = `${qb?.name ?? 'QB'} completes to ${receiver?.name ?? 'WR'} for ${yards} yard${yards !== 1 ? 's' : ''}`;
    if (yards >= 20) description += ' — BIG GAIN!';
    tickClock(state, clockUsed);

    const newYardLine = state.yardLine + yards;
    const firstDown = yards >= state.yardsToGo;

    if (newYardLine >= 100) {
      return scoretouchdown(state, receiver?.name ?? 'WR', receiver?.id, teamId, clockUsed, 'pass', yards, qb?.name);
    } else if (firstDown) {
      state.yardLine = newYardLine;
      state.down = 1;
      state.yardsToGo = Math.min(10, 100 - newYardLine);
      playType = 'pass';
    } else if (state.down >= 4) {
      state.possession = flipPossession(state.possession);
      state.yardLine = Math.max(1, Math.min(99, 100 - newYardLine));
      state.down = 1; state.yardsToGo = 10;
      playType = 'turnover_downs';
      description += ' — short of 1st, turnover on downs';
    } else {
      state.yardLine = newYardLine;
      state.down++;
      state.yardsToGo = state.yardsToGo - yards;
      playType = 'pass';
    }
  }

  return {
    type: playType, yardsGained: yards, description,
    quarter: state.quarter, clockSeconds: state.clockSeconds + clockUsed,
    playerName: receiver?.name ?? qb?.name, isScoring: false,
    homeScore: state.homeScore, awayScore: state.awayScore,
    down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
    possession: state.possession, clockUsed,
  };
}

function scoretouchdown(
  state: LiveGameState, scorerName: string, scorerId: number | undefined, teamId: number,
  clockUsed: number, playType: 'run' | 'pass', yards: number, qbName?: string
): PlayResult {
  let description: string;
  if (playType === 'pass') {
    description = `TOUCHDOWN! ${scorerName} hauls in the ${yards}-yd pass${qbName ? ` from ${qbName}` : ''} — 6 points!`;
    if (scorerId) {
      const rs = ensureStat(state, scorerId, teamId);
      rs.rec_yards += yards; rs.rec_tds++;
      rs.receptions++;
    }
    if (qbName) {
      const qbPlayers = offPlayers(state);
      const qb = byPos(qbPlayers, 'QB')[0];
      if (qb) {
        const qs = ensureStat(state, qb.id, teamId);
        qs.completions++; qs.pass_yards += yards; qs.pass_tds++;
      }
    }
  } else {
    description = `TOUCHDOWN! ${scorerName} punches it in from ${yards} yard${yards !== 1 ? 's' : ''} out!`;
    if (scorerId) {
      const rs = ensureStat(state, scorerId, teamId);
      rs.rush_yards += Math.max(0, yards); rs.rush_tds++;
      rs.rush_attempts++;
    }
  }

  if (state.possession === 'home') state.homeScore += 7;
  else state.awayScore += 7;

  // Extra point (auto)
  const k = byPos(offPlayers(state), 'K')[0];
  if (k) {
    const ks = ensureStat(state, k.id, teamId);
    ks.xp_made++; ks.xp_att++;
  }

  state.kickoffNext = true;
  state.yardLine = 35;
  state.down = 1; state.yardsToGo = 10;

  return {
    type: 'touchdown', yardsGained: yards, description,
    quarter: state.quarter, clockSeconds: state.clockSeconds,
    playerName: scorerName, isScoring: true,
    homeScore: state.homeScore, awayScore: state.awayScore,
    down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
    possession: state.possession, clockUsed,
  };
}

function executeFieldGoal(state: LiveGameState): PlayResult {
  const players = offPlayers(state);
  const k = byPos(players, 'K')[0] ?? null;
  const teamId = offTeamId(state);
  const distance = Math.max(18, (100 - state.yardLine) + 17);
  const kRating = k?.rating ?? 75;
  const successRate = Math.max(0.25, Math.min(0.97, 0.97 - (distance - 20) * 0.023 * (80 / kRating)));
  const isGood = Math.random() < successRate;
  const clockUsed = 5;

  if (k) {
    const ks = ensureStat(state, k.id, teamId);
    ks.fg_att++;
    if (isGood) ks.fg_made++;
  }

  tickClock(state, clockUsed);

  if (isGood) {
    if (state.possession === 'home') state.homeScore += 3;
    else state.awayScore += 3;
    state.kickoffNext = true;
    return {
      type: 'field_goal', yardsGained: 0,
      description: `${k?.name ?? 'K'} is TRUE from ${distance} yards — FIELD GOAL GOOD! 3 points.`,
      quarter: state.quarter, clockSeconds: state.clockSeconds,
      playerName: k?.name, isScoring: true,
      homeScore: state.homeScore, awayScore: state.awayScore,
      down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
      possession: state.possession, clockUsed,
    };
  } else {
    state.possession = flipPossession(state.possession);
    state.yardLine = Math.max(1, Math.min(99, 100 - Math.max(20, state.yardLine - 7)));
    state.down = 1; state.yardsToGo = 10;
    return {
      type: 'field_goal_miss', yardsGained: 0,
      description: `${k?.name ?? 'K'} misses from ${distance} — NO GOOD! Turnover on downs.`,
      quarter: state.quarter, clockSeconds: state.clockSeconds,
      playerName: k?.name, isScoring: false,
      homeScore: state.homeScore, awayScore: state.awayScore,
      down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
      possession: state.possession, clockUsed,
    };
  }
}

function executePunt(state: LiveGameState): PlayResult {
  const net = Math.round(Math.max(15, rn(39, 7)));
  const clockUsed = 5;
  tickClock(state, clockUsed);

  const prevYardLine = state.yardLine;
  state.possession = flipPossession(state.possession);
  state.yardLine = Math.max(1, Math.min(80, 100 - prevYardLine - net));
  state.down = 1; state.yardsToGo = 10;

  return {
    type: 'punt', yardsGained: -net,
    description: `Punt — ${net}-yard net, opponent ball at their own ${state.yardLine}`,
    quarter: state.quarter, clockSeconds: state.clockSeconds,
    isScoring: false,
    homeScore: state.homeScore, awayScore: state.awayScore,
    down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
    possession: state.possession, clockUsed,
  };
}

// CPU 4th-down decision
function cpuFourthDown(state: LiveGameState): 'field_goal' | 'punt' | 'go_for_it' {
  const distToGoal = 100 - state.yardLine;
  const isLateGame = state.quarter === 4 && state.clockSeconds < 300;
  const scoreDiff = state.possession === 'home'
    ? state.homeScore - state.awayScore
    : state.awayScore - state.homeScore;

  if (distToGoal <= 35 && scoreDiff >= -10) return 'field_goal'; // inside FG range, not desperate
  if (distToGoal <= 5 && (isLateGame || scoreDiff <= -8)) return 'go_for_it'; // goal line, desperate
  if (state.yardsToGo <= 2 && scoreDiff < -7) return 'go_for_it'; // short yardage, trailing big
  return 'punt';
}

// Offensive play selection
function selectPlayType(state: LiveGameState): 'run' | 'pass' {
  const scoreDiff = state.possession === 'home'
    ? state.homeScore - state.awayScore
    : state.awayScore - state.homeScore;
  const lateGame = state.quarter === 4 && state.clockSeconds < 300;

  let passProb = 0.55;
  if (state.down === 3 && state.yardsToGo <= 3) passProb = 0.40;
  else if (state.down === 3 && state.yardsToGo > 6) passProb = 0.72;
  else if (state.down === 2 && state.yardsToGo <= 2) passProb = 0.30;

  if (lateGame && scoreDiff < -8) passProb = Math.min(0.85, passProb + 0.20);
  if (lateGame && scoreDiff > 10) passProb = Math.max(0.20, passProb - 0.20);

  return Math.random() < passProb ? 'pass' : 'run';
}

// Advance clock and handle quarter transitions
function checkQuarterEnd(state: LiveGameState): PlayResult | null {
  if (state.clockSeconds > 0) return null;

  if (state.quarter >= 4) {
    if (state.homeScore !== state.awayScore) {
      state.done = true;
      const winner = state.homeScore > state.awayScore ? state.homeTeamName : state.awayTeamName;
      return {
        type: 'game_over', yardsGained: 0,
        description: `FINAL: ${state.homeTeamName} ${state.homeScore} — ${state.awayTeamName} ${state.awayScore}`,
        quarter: state.quarter, clockSeconds: 0, isScoring: false,
        homeScore: state.homeScore, awayScore: state.awayScore,
        down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
        possession: state.possession, clockUsed: 0,
      };
    }
    // OT
    state.quarter = 5;
    state.clockSeconds = 600; // 10-min OT
    state.kickoffNext = true;
    return null;
  }

  state.quarter++;
  state.clockSeconds = 900;

  // Halftime: reset timeouts, flip possession for kickoff
  if (state.quarter === 3) {
    state.timeouts = { home: 3, away: 3 };
    state.kickoffNext = true;
    // Second-half kickoff: possession flips from who kicked off in Q1
    state.possession = flipPossession(state.possession);
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initLiveGame(gameId: number, userTeamId: number): LiveGameState {
  const gameRow = db.prepare(
    'SELECT home_team_id, away_team_id, season, week FROM games WHERE id = ?'
  ).get(gameId) as any;
  if (!gameRow) throw new Error(`Game ${gameId} not found`);

  const homeTeamRow = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(gameRow.home_team_id) as any;
  const awayTeamRow = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(gameRow.away_team_id) as any;

  const homeData = loadTeamData(gameRow.home_team_id);
  const awayData = loadTeamData(gameRow.away_team_id);

  // Load game plan if user is one of the teams
  let userGamePlan: any = undefined;
  try {
    const gp = db.prepare("SELECT value FROM settings WHERE key = 'user_gameplan'").get() as any;
    if (gp) userGamePlan = JSON.parse(gp.value);
  } catch {}

  const homeRatings = computeTeamRatings(homeData);
  const awayRatings = computeTeamRatings(awayData);

  // Apply game plan modifiers to user team
  if (userGamePlan) {
    const OFFENSE_MODS: Record<string, number> = { balanced: 0, run_heavy: -1, pass_attack: 3, ball_control: -2, bombs_away: 5 };
    const DEFENSE_MODS: Record<string, number> = { base: 0, blitz: 5, zone: 3, press_man: 2, run_stop: 4 };
    if (gameRow.home_team_id === userTeamId) {
      homeRatings.offenseRating += OFFENSE_MODS[userGamePlan.offense ?? 'balanced'] ?? 0;
      homeRatings.defenseRating += DEFENSE_MODS[userGamePlan.defense ?? 'base'] ?? 0;
    } else if (gameRow.away_team_id === userTeamId) {
      awayRatings.offenseRating += OFFENSE_MODS[userGamePlan.offense ?? 'balanced'] ?? 0;
      awayRatings.defenseRating += DEFENSE_MODS[userGamePlan.defense ?? 'base'] ?? 0;
    }
  }

  // Coin flip for first possession
  const firstPossession: 'home' | 'away' = Math.random() < 0.5 ? 'home' : 'away';

  const state: LiveGameState = {
    gameId,
    homeTeamId: gameRow.home_team_id,
    awayTeamId: gameRow.away_team_id,
    homeTeamName: `${homeTeamRow.city} ${homeTeamRow.name}`,
    awayTeamName: `${awayTeamRow.city} ${awayTeamRow.name}`,
    season: gameRow.season,
    week: gameRow.week,
    userTeamId,
    quarter: 1,
    clockSeconds: 900,
    possession: firstPossession,
    yardLine: 35,
    down: 1,
    yardsToGo: 10,
    homeScore: 0,
    awayScore: 0,
    timeouts: { home: 3, away: 3 },
    challenges: { home: 2, away: 2 },
    done: false,
    kickoffNext: true,
    homeRatings,
    awayRatings,
    homePlayers: loadLivePlayers(gameRow.home_team_id),
    awayPlayers: loadLivePlayers(gameRow.away_team_id),
    playerStats: {},
    homeQBInts: 0,
    awayQBInts: 0,
  };

  activeGames.set(gameId, state);
  return state;
}

export function simNextPlay(gameId: number, decision: UserDecision = null): SimPlayResult {
  const state = activeGames.get(gameId);
  if (!state) throw new Error(`No active game ${gameId}`);
  if (state.done) return { play: buildGameOverPlay(state), state };

  // ── Handle timeout decision ──────────────────────────────────────────────
  if (decision?.type === 'timeout') {
    const side = offTeamId(state) === state.homeTeamId ? 'home' : 'away';
    if (state.timeouts[side] > 0) {
      state.timeouts[side]--;
      const play: PlayResult = {
        type: 'timeout', yardsGained: 0,
        description: `${side === 'home' ? state.homeTeamName : state.awayTeamName} calls timeout — ${state.timeouts[side]} remaining`,
        quarter: state.quarter, clockSeconds: state.clockSeconds,
        isScoring: false, homeScore: state.homeScore, awayScore: state.awayScore,
        down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
        possession: state.possession, clockUsed: 0,
      };
      return { play, state };
    }
  }

  // ── Handle challenge decision ─────────────────────────────────────────────
  if (decision?.type === 'challenge') {
    const isUserHome = state.homeTeamId === state.userTeamId;
    const challengeSide: 'home' | 'away' = isUserHome ? 'home' : 'away';
    const timeoutSide = challengeSide;
    if (state.challenges[challengeSide] > 0) {
      state.challenges[challengeSide]--;
      const offRatio = (state.possession === 'home' ? state.homeRatings : state.awayRatings).offenseRating;
      const defRatio = (state.possession === 'home' ? state.awayRatings : state.homeRatings).defenseRating;
      const successProb = 0.45 + (Math.abs(offRatio - defRatio) / 100) * 0.15;
      const success = Math.random() < successProb;

      let description: string;
      if (success && state.lastPlaySnapshot) {
        description = 'CHALLENGE UPHELD — play reversed!';
        // Restore pre-play state (score, possession, down/distance)
        const snap = state.lastPlaySnapshot;
        if (snap.homeScore !== undefined) state.homeScore = snap.homeScore;
        if (snap.awayScore !== undefined) state.awayScore = snap.awayScore;
        if (snap.possession) state.possession = snap.possession;
        if (snap.yardLine !== undefined) state.yardLine = snap.yardLine;
        if (snap.down !== undefined) state.down = snap.down;
        if (snap.yardsToGo !== undefined) state.yardsToGo = snap.yardsToGo;
        if (snap.kickoffNext !== undefined) state.kickoffNext = snap.kickoffNext;
        state.lastPlaySnapshot = undefined;
      } else {
        description = 'CHALLENGE FAILED — call stands. Timeout charged.';
        if (state.timeouts[timeoutSide] > 0) state.timeouts[timeoutSide]--;
      }

      const play: PlayResult = {
        type: 'challenge', yardsGained: 0, description,
        quarter: state.quarter, clockSeconds: state.clockSeconds,
        isScoring: false, homeScore: state.homeScore, awayScore: state.awayScore,
        down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
        possession: state.possession, clockUsed: 0,
      };
      return { play, state };
    }
  }

  // ── Kickoff ───────────────────────────────────────────────────────────────
  if (state.kickoffNext) {
    const play = executeKickoff(state);
    return { play, state };
  }

  // ── 4th Down Decision ─────────────────────────────────────────────────────
  if (state.down === 4) {
    let fourthChoice: 'field_goal' | 'punt' | 'go_for_it';

    if (decision?.type === 'fourth_down') {
      fourthChoice = decision.choice;
    } else if (isUserPossession(state)) {
      // Await user decision
      return { play: buildAwaitPlay(state), state, awaitingDecision: 'fourth_down' };
    } else {
      fourthChoice = cpuFourthDown(state);
    }

    state.lastPlaySnapshot = snapshotState(state);
    let play: PlayResult;
    if (fourthChoice === 'field_goal') play = executeFieldGoal(state);
    else if (fourthChoice === 'punt') play = executePunt(state);
    else {
      const pt = selectPlayType(state);
      play = pt === 'run' ? executeRun(state) : executePass(state);
    }

    const qEnd = checkQuarterEnd(state);
    if (qEnd && qEnd.type === 'game_over') return { play: qEnd, state };
    return { play, state };
  }

  // ── Regular Play ─────────────────────────────────────────────────────────
  state.lastPlaySnapshot = snapshotState(state);
  const playType = selectPlayType(state);
  const play = playType === 'run' ? executeRun(state) : executePass(state);

  const qEnd = checkQuarterEnd(state);
  if (qEnd && qEnd.type === 'game_over') return { play: qEnd, state };

  return { play, state };
}

function snapshotState(state: LiveGameState): Partial<LiveGameState> {
  return {
    homeScore: state.homeScore, awayScore: state.awayScore,
    possession: state.possession, yardLine: state.yardLine,
    down: state.down, yardsToGo: state.yardsToGo,
    kickoffNext: state.kickoffNext,
  };
}

function buildAwaitPlay(state: LiveGameState): PlayResult {
  return {
    type: 'awaiting_decision', yardsGained: 0, description: '',
    quarter: state.quarter, clockSeconds: state.clockSeconds,
    isScoring: false, homeScore: state.homeScore, awayScore: state.awayScore,
    down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
    possession: state.possession, clockUsed: 0,
  };
}

function buildGameOverPlay(state: LiveGameState): PlayResult {
  return {
    type: 'game_over', yardsGained: 0,
    description: `FINAL: ${state.homeTeamName} ${state.homeScore} — ${state.awayTeamName} ${state.awayScore}`,
    quarter: state.quarter, clockSeconds: 0, isScoring: false,
    homeScore: state.homeScore, awayScore: state.awayScore,
    down: state.down, yardsToGo: state.yardsToGo, yardLine: state.yardLine,
    possession: state.possession, clockUsed: 0,
  };
}

// Sim all remaining plays at once (for "Skip to End")
export function simToCompletion(gameId: number): { plays: PlayResult[]; state: LiveGameState } {
  const plays: PlayResult[] = [];
  let iterations = 0;
  const MAX = 200;

  while (iterations++ < MAX) {
    const result = simNextPlay(gameId, null);
    plays.push(result.play);
    if (result.state.done) break;
    // Auto-handle awaiting decisions with CPU logic
    if (result.awaitingDecision === 'fourth_down') {
      const state = result.state;
      const cpuChoice = cpuFourthDown(state);
      const r2 = simNextPlay(gameId, { type: 'fourth_down', choice: cpuChoice });
      plays.push(r2.play);
      if (r2.state.done) break;
    }
  }

  const state = activeGames.get(gameId)!;
  if (!state.done) state.done = true; // force done after max iterations
  return { plays, state };
}

// Finalize: commit stats to DB and clean up
export function finalizeLiveGame(gameId: number): {
  success: boolean;
  homeScore: number;
  awayScore: number;
  stats: any[];
} {
  const state = activeGames.get(gameId);
  if (!state) return { success: false, homeScore: 0, awayScore: 0, stats: [] };

  const { homeScore, awayScore } = state;

  // Build player stats array in the format expected by the DB
  const offStats = Object.values(state.playerStats);

  // Generate defensive stats using existing engine (reuses proven logic)
  const homeData = loadTeamData(state.homeTeamId);
  const awayData = loadTeamData(state.awayTeamId);
  const homeDefStats = generateDefensiveStats(homeData, state.awayQBInts, state.homeRatings.defenseRating);
  const awayDefStats = generateDefensiveStats(awayData, state.homeQBInts, state.awayRatings.defenseRating);
  const homeKStat = generateKickerStats(homeData, { tds: Math.floor(homeScore / 7), fgs: Math.floor((homeScore % 7) / 3) }, Math.floor(homeScore / 7));
  const awayKStat = generateKickerStats(awayData, { tds: Math.floor(awayScore / 7), fgs: Math.floor((awayScore % 7) / 3) }, Math.floor(awayScore / 7));

  const defAndKStats = [
    ...homeDefStats, ...awayDefStats,
    ...(homeKStat ? [homeKStat] : []),
    ...(awayKStat ? [awayKStat] : []),
  ];

  // Insert live stats + def/k stats into DB
  const insertStat = db.prepare(`
    INSERT OR IGNORE INTO stats
    (game_id, season, week, is_playoff, player_id, team_id,
     pass_attempts, completions, pass_yards, pass_tds, interceptions,
     rush_attempts, rush_yards, rush_tds, targets, receptions, rec_yards, rec_tds,
     tackles, assisted_tackles, sacks, tfl, forced_fumbles, fumble_recoveries,
     def_interceptions, pass_deflections, def_tds, fg_made, fg_att, xp_made, xp_att)
    VALUES
    (@game_id, @season, @week, @is_playoff, @player_id, @team_id,
     @pass_attempts, @completions, @pass_yards, @pass_tds, @interceptions,
     @rush_attempts, @rush_yards, @rush_tds, @targets, @receptions, @rec_yards, @rec_tds,
     @tackles, @assisted_tackles, @sacks, @tfl, @forced_fumbles, @fumble_recoveries,
     @def_interceptions, @pass_deflections, @def_tds, @fg_made, @fg_att, @xp_made, @xp_att)
  `);

  const baseRow = { game_id: gameId, season: state.season, week: state.week, is_playoff: 0 };

  db.transaction(() => {
    // Live-tracked offense stats
    for (const s of offStats) {
      if (s.pass_attempts + s.rush_attempts + s.targets + s.fg_att === 0) continue;
      insertStat.run({
        ...baseRow,
        player_id: s.player_id, team_id: s.team_id,
        pass_attempts: s.pass_attempts, completions: s.completions,
        pass_yards: s.pass_yards, pass_tds: s.pass_tds, interceptions: s.interceptions,
        rush_attempts: s.rush_attempts, rush_yards: s.rush_yards, rush_tds: s.rush_tds,
        targets: s.targets, receptions: s.receptions, rec_yards: s.rec_yards, rec_tds: s.rec_tds,
        tackles: s.tackles, assisted_tackles: s.assisted_tackles,
        sacks: s.sacks, tfl: s.tfl, forced_fumbles: s.forced_fumbles,
        fumble_recoveries: s.fumble_recoveries, def_interceptions: s.def_interceptions,
        pass_deflections: s.pass_deflections, def_tds: s.def_tds,
        fg_made: s.fg_made, fg_att: s.fg_att, xp_made: s.xp_made, xp_att: s.xp_att,
      });
    }

    // Defensive + kicker stats (from existing engine)
    for (const s of defAndKStats) {
      const teamId = s.team_id ?? (homeData.players.find((p: any) => p.id === s.player_id) ? state.homeTeamId : state.awayTeamId);
      insertStat.run({
        ...baseRow,
        player_id: s.player_id, team_id: teamId,
        pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
        rush_attempts: 0, rush_yards: 0, rush_tds: 0,
        targets: 0, receptions: 0, rec_yards: 0, rec_tds: 0,
        tackles: (s as any).tackles ?? 0, assisted_tackles: (s as any).assisted_tackles ?? 0,
        sacks: (s as any).sacks ?? 0, tfl: (s as any).tfl ?? 0,
        forced_fumbles: 0, fumble_recoveries: 0,
        def_interceptions: (s as any).def_interceptions ?? 0,
        pass_deflections: (s as any).pass_deflections ?? 0,
        def_tds: (s as any).def_tds ?? 0,
        fg_made: (s as any).fg_made ?? 0, fg_att: (s as any).fg_att ?? 0,
        xp_made: (s as any).xp_made ?? 0, xp_att: (s as any).xp_att ?? 0,
      });
    }

    // Update game record
    db.prepare(`
      UPDATE games SET is_simulated = 1, home_score = ?, away_score = ?
      WHERE id = ?
    `).run(homeScore, awayScore, gameId);
  })();

  activeGames.delete(gameId);
  return { success: true, homeScore, awayScore, stats: offStats };
}

// Abort: fast-sim using old engine (avoids losing the game entirely)
export function abortLiveGame(gameId: number): void {
  activeGames.delete(gameId);
}

export function hasActiveGame(gameId: number): boolean {
  return activeGames.has(gameId);
}
