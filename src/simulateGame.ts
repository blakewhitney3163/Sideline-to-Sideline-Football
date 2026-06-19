const { db } = require('./database');
import type { PlayerStats } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

type WeatherType = 'clear' | 'rain' | 'wind' | 'snow';

interface PlayerRow {
  id: number;
  overall_rating: number;
  speed: number | null; strength: number | null; awareness: number | null;
  throw_accuracy: number | null; throw_power: number | null;
  catching: number | null; route_running: number | null;
  tackle_rating: number | null; coverage: number | null; pass_rush: number | null;
}

interface TeamRatings { offenseRating: number; defenseRating: number; }

interface WeatherMultipliers {
  score: number; passYards: number; compPct: number;
  rushYards: number; rushAttempts: number;
}

interface ScoringEvents { tds: number; fgs: number; }

export type GamePlayerStat = Omit<PlayerStats, 'game_id'>;

export interface SimResult {
  homeScore: number; awayScore: number;
  homeQuarters: number[]; awayQuarters: number[];
  weather: WeatherType;
  homePlayerStats: GamePlayerStat[];
  awayPlayerStats: GamePlayerStat[];
}

// ─── Math Helpers ─────────────────────────────────────────────────────────────

function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.random(), u2 = Math.random();
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stdDev;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

function clampFloat(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val * 2) / 2));
}

function attr(p: PlayerRow, col: keyof Omit<PlayerRow, 'id'>, fallback = 70): number {
  return (p[col] as number | null) ?? fallback;
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

function getHealthyByGroup(teamId: number, positionGroup: string, limit: number): PlayerRow[] {
  const cols = `p.id, p.overall_rating, p.speed, p.strength, p.awareness,
    p.throw_accuracy, p.throw_power, p.catching, p.route_running,
    p.tackle_rating, p.coverage, p.pass_rush`;
  const rows = db.prepare(`
    SELECT ${cols} FROM depth_chart dc
    JOIN players p ON dc.player_id = p.id
    WHERE dc.team_id = ? AND dc.position_group = ? AND p.roster_status = 'active'
      AND p.injury_status NOT IN ('out', 'ir')
    ORDER BY dc.slot LIMIT ?
  `).all(teamId, positionGroup, limit) as PlayerRow[];
  if (rows.length > 0) return rows;
  return db.prepare(`
    SELECT id, overall_rating, speed, strength, awareness,
      throw_accuracy, throw_power, catching, route_running,
      tackle_rating, coverage, pass_rush
    FROM players
    WHERE team_id = ? AND position = ? AND roster_status = 'active'
      AND injury_status NOT IN ('out', 'ir')
    ORDER BY overall_rating DESC LIMIT ?
  `).all(teamId, positionGroup, limit) as PlayerRow[];
}

function getTeamRatings(teamId: number): TeamRatings {
  const players = db.prepare(`
    SELECT position, overall_rating, COALESCE(morale, 75) as morale FROM players
    WHERE team_id = ? AND injury_status NOT IN ('out', 'ir')
  `).all(teamId) as { position: string; overall_rating: number; morale: number }[];

  const effOvr = (p: { overall_rating: number; morale: number }) =>
    p.overall_rating * (1 + (p.morale - 75) * 0.001);

  const offense = players.filter(p => ['QB','RB','WR','TE','OL'].includes(p.position));
  const defense = players.filter(p => ['DL','LB','CB','S'].includes(p.position));
  const offenseRating = offense.reduce((s, p) => s + effOvr(p), 0) / (offense.length || 1);
  const defenseRating = defense.reduce((s, p) => s + effOvr(p), 0) / (defense.length || 1);
  return { offenseRating, defenseRating };
}

// ─── Weather ──────────────────────────────────────────────────────────────────

function getWeather(week: number): WeatherType {
  const lsf = Math.max(0, (week - 8) / 9);
  const r = Math.random();
  if (r < 0.05 + lsf * 0.15) return 'snow';
  if (r < 0.15 + lsf * 0.20) return 'rain';
  if (r < 0.25 + lsf * 0.10) return 'wind';
  return 'clear';
}

function weatherMultipliers(w: WeatherType): WeatherMultipliers {
  switch (w) {
    case 'snow': return { score: 0.84, passYards: 0.74, compPct: -0.07, rushYards: 1.06, rushAttempts: 1.08 };
    case 'rain': return { score: 0.92, passYards: 0.87, compPct: -0.03, rushYards: 1.02, rushAttempts: 1.04 };
    case 'wind': return { score: 0.90, passYards: 0.80, compPct: -0.05, rushYards: 1.00, rushAttempts: 1.02 };
    default:     return { score: 1.00, passYards: 1.00, compPct: 0.00,  rushYards: 1.00, rushAttempts: 1.00 };
  }
}

// ─── Scoring Engine ───────────────────────────────────────────────────────────

/**
 * Generate scoring events from drive outcomes rather than a raw score number.
 * This makes stats coherent with the final score: every TD and FG on the
 * scoreboard maps to real stat-line events.
 */
function generateScoringEvents(
  offenseRating: number,
  defenseRating: number,
  wx: WeatherMultipliers,
  isHome: boolean
): ScoringEvents {
  const efficiencyRatio = (offenseRating / Math.max(defenseRating, 50)) * wx.score;
  // Home field is worth ~half a scoring drive on average
  const baseDrives = isHome ? 4.4 : 3.9;
  const scoringDrives = Math.max(0, Math.round(randomNormal(baseDrives * efficiencyRatio, 1.1)));

  // Better offenses convert scoring drives into TDs at a higher rate
  const tdRate = Math.min(0.78, Math.max(0.42,
    0.60 + (offenseRating - 75) * 0.004 + (isHome ? 0.02 : 0)
  ));

  let tds = 0, fgs = 0;
  for (let i = 0; i < scoringDrives; i++) {
    if (Math.random() < tdRate) tds++;
    else fgs++;
  }
  return { tds, fgs };
}

// ─── Overtime ────────────────────────────────────────────────────────────────

function simulateOvertime(
  homeRatings: TeamRatings,
  awayRatings: TeamRatings,
  wx: WeatherMultipliers
): { homeOTScore: number; awayOTScore: number } {
  const homeFirst = Math.random() > 0.5;
  const firstOff  = homeFirst ? homeRatings : awayRatings;
  const secondOff = homeFirst ? awayRatings : homeRatings;

  function possession(offR: number, defR: number): 'td' | 'fg' | 'none' {
    const eff = (offR / Math.max(defR, 50)) * wx.score;
    if (Math.random() >= Math.min(0.78, 0.54 * eff)) return 'none';
    return Math.random() < 0.56 ? 'td' : 'fg';
  }

  const r1 = possession(firstOff.offenseRating, secondOff.defenseRating);

  if (r1 === 'td') {
    return homeFirst
      ? { homeOTScore: 7, awayOTScore: 0 }
      : { homeOTScore: 0, awayOTScore: 7 };
  }

  if (r1 === 'fg') {
    const r2 = possession(secondOff.offenseRating, firstOff.defenseRating);
    if (r2 === 'td') {
      return homeFirst
        ? { homeOTScore: 3, awayOTScore: 7 }
        : { homeOTScore: 7, awayOTScore: 3 };
    }
    if (r2 === 'fg') {
      // Both kicked FGs — sudden death coin flip
      return Math.random() > 0.5
        ? (homeFirst ? { homeOTScore: 6, awayOTScore: 3 } : { homeOTScore: 3, awayOTScore: 6 })
        : (homeFirst ? { homeOTScore: 3, awayOTScore: 6 } : { homeOTScore: 6, awayOTScore: 3 });
    }
    return homeFirst
      ? { homeOTScore: 3, awayOTScore: 0 }
      : { homeOTScore: 0, awayOTScore: 3 };
  }

  // First team fails — second team gets full possession
  const r2 = possession(secondOff.offenseRating, firstOff.defenseRating);
  if (r2 !== 'none') {
    const pts = r2 === 'td' ? 7 : 3;
    return homeFirst
      ? { homeOTScore: 0, awayOTScore: pts }
      : { homeOTScore: pts, awayOTScore: 0 };
  }

  // Both teams fail — home team wins walk-off FG
  return { homeOTScore: 3, awayOTScore: 0 };
}

// ─── Offensive Stats ──────────────────────────────────────────────────────────

function generatePlayerStats(
  teamId: number,
  events: ScoringEvents,
  offenseRating: number,
  wx: WeatherMultipliers,
  isHome: boolean,
  scoreDiff: number   // positive = this team is winning (used for game script)
): GamePlayerStat[] {
  const stats: GamePlayerStat[] = [];
  const teamRatingFactor = offenseRating / 75;

  // Game script: trailing teams pass more; leading teams run more
  const gameScriptPassMod = scoreDiff < -14 ? 1.20 : scoreDiff < -7 ? 1.10 : scoreDiff > 14 ? 0.88 : 1.0;
  const gameScriptRushMod = scoreDiff >  14 ? 1.15 : scoreDiff >  7 ? 1.08 : scoreDiff < -14 ? 0.85 : 1.0;

  const passTDs = clamp(Math.round(events.tds * 0.72), 0, events.tds);
  const rushTDs = events.tds - passTDs;

  const qbs = getHealthyByGroup(teamId, 'QB', 1);
  const rbs = getHealthyByGroup(teamId, 'RB', 3);
  const wrs = getHealthyByGroup(teamId, 'WR', 4);
  const tes = getHealthyByGroup(teamId, 'TE', 2);
  const qb  = qbs[0] ?? null;

    const defStatDefaults = {
    tackles: 0, assisted_tackles: 0, sacks: 0, tfl: 0,
    forced_fumbles: 0, fumble_recoveries: 0,
    def_interceptions: 0, pass_deflections: 0, def_tds: 0,
    fg_made: 0, fg_att: 0, xp_made: 0, xp_att: 0,
  };

  // ── QB ────────────────────────────────────────────────────────────────────
  let passYardsGenerated = 250 * teamRatingFactor;
  if (qb) {
    const qbRatingFactor  = qb.overall_rating / 75;
    const combinedFactor  = (teamRatingFactor + qbRatingFactor) / 2;
    const powerBonus      = (attr(qb, 'throw_power') - 75) * 0.8;
    const tdYardageBonus  = passTDs * 7; // TDs inflate passing yardage slightly

    passYardsGenerated = clamp(
      randomNormal((220 + powerBonus + tdYardageBonus) * combinedFactor, 48)
      * wx.passYards * gameScriptPassMod,
      50, 460
    );

    const passAttempts = clamp(randomNormal(34 * gameScriptPassMod, 5), 18, 60);
    const throwAcc     = attr(qb, 'throw_accuracy');
    const homePenalty  = isHome ? 0.012 : -0.018;
    const compPct = Math.min(0.78, Math.max(0.42,
      0.55 + (throwAcc - 70) * 0.004 + homePenalty + wx.compPct + randomNormal(0, 0.033)
    ));
    const completions = clamp(passAttempts * compPct, 8, passAttempts);
    const intMean = Math.max(0.04,
      1.4 - (throwAcc / 100) * 0.6 - (attr(qb, 'awareness') / 100) * 0.35
      + (isHome ? -0.05 : 0.10) + (scoreDiff < -14 ? 0.20 : 0) // desperation throws
    );
    const ints    = clamp(randomNormal(intMean, 0.6), 0, 4);
    const qbCarries = Math.random() > 0.6 ? clamp(randomNormal(4, 2), 0, 8) : 0;

    stats.push({
      player_id: qb.id, team_id: teamId,
      pass_attempts: passAttempts, completions, pass_yards: passYardsGenerated,
      pass_tds: passTDs, interceptions: ints,
      rush_attempts: qbCarries,
      rush_yards: clamp(randomNormal(qbCarries * 5, 8), 0, 55), rush_tds: 0,
      targets: 0, receptions: 0, rec_yards: 0, rec_tds: 0,
      ...defStatDefaults,
    });
  }

  // ── RBs ───────────────────────────────────────────────────────────────────
  const totalRushAttempts = clamp(
    randomNormal(26 * wx.rushAttempts * gameScriptRushMod, 5), 12, 48
  );
  const rbRatingWeights = rbs.map(rb => rb.overall_rating / 75);
  const rbWeightTotal   = rbRatingWeights.reduce((a, b) => a + b, 0) || 1;
  const rb1Rating = rbs[0]?.overall_rating ?? 70;
  const rb2Rating = rbs[1]?.overall_rating ?? 60;
  const workhorseBonus = Math.max(0, (rb1Rating - rb2Rating) / 10) * 0.06;

  rbs.forEach((rb, i) => {
    const baseShare     = rbRatingWeights[i] / rbWeightTotal;
    const adjustedShare = i === 0
      ? baseShare + workhorseBonus
      : baseShare - workhorseBonus / (rbs.length - 1 || 1);
    const share   = clamp(randomNormal(adjustedShare * 100, 8), i === 0 ? 25 : 0, 82) / 100;
    const carries = clamp(totalRushAttempts * share, i === 0 ? 6 : 0, 36);
    const speedFactor = (attr(rb, 'speed') - 70) * 0.03;
    const ypc       = Math.max(2.4, randomNormal((4.2 + speedFactor) * wx.rushYards, 0.8));
    const rushYards = clamp(carries * ypc, 0, 240);
    const rbRushTDs = i === 0 && rushTDs > 0 ? Math.ceil(rushTDs * 0.75) :
                      i === 1 && rushTDs > 1 && Math.random() < 0.3 ? 1 : 0;

    stats.push({
      player_id: rb.id, team_id: teamId,
      pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
      rush_attempts: carries, rush_yards: rushYards, rush_tds: rbRushTDs,
      targets: clamp(randomNormal(4 - i * 1.5, 2), 0, 8),
      receptions: clamp(randomNormal(3 - i, 1), 0, 6),
      rec_yards: clamp(randomNormal(28 - i * 8, 12), 0, 70),
      rec_tds: 0,
      ...defStatDefaults,
    });
  });

  // ── WRs + TEs ─────────────────────────────────────────────────────────────
  const receivers  = [...wrs, ...tes];
  const actualCount = receivers.length;

  function buildSlotBias(count: number): number[] {
    return Array.from({ length: count }, (_, i) => {
      const isTe = i >= wrs.length;
      if (isTe) return Math.max(0.25, 0.85 - (i - wrs.length) * 0.25);
      return Math.max(0.28, 1.30 - i * (0.30 / Math.max(1, wrs.length - 1)));
    });
  }

  const slotBias       = buildSlotBias(actualCount);
  const recPowerWeights = receivers.map((r, i) =>
    Math.pow(attr(r, 'route_running') / 75, 2.2) * (slotBias[i] ?? 0.30)
  );
  const recPowerTotal   = recPowerWeights.reduce((a, b) => a + b, 0) || 1;
  const noisyWeights    = recPowerWeights.map(w => Math.max(0.01, w + randomNormal(0, w * 0.3)));
  const noisyTotal      = noisyWeights.reduce((a, b) => a + b, 0) || 1;
  let remainingRecTDs   = passTDs;

  receivers.forEach((rec, i) => {
    const powerShare  = noisyWeights[i] / noisyTotal;
    const recYards    = clamp(Math.round(passYardsGenerated * powerShare), 0, 260);
    const ratingFactor = rec.overall_rating / 75;
    const baseTargets  = i === 0 ? 9 * ratingFactor : (8 * ratingFactor) - i * 0.8;
    const targets      = clamp(randomNormal(baseTargets, 2), i === 0 ? 2 : 0, 16);
    const catchRate    = Math.min(0.83, Math.max(0.42,
      0.50 + (attr(rec, 'catching') - 65) * 0.006 + randomNormal(0, 0.04)
    ));
    const recs    = clamp(targets * catchRate, 0, targets);
    const tdThreshold = 0.60 - (rec.overall_rating - 70) * 0.005;
    const recTDs  = remainingRecTDs > 0 && Math.random() > tdThreshold ? 1 : 0;
    if (recTDs) remainingRecTDs--;

    stats.push({
      player_id: rec.id, team_id: teamId,
      pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
      rush_attempts: 0, rush_yards: 0, rush_tds: 0,
      targets, receptions: recs, rec_yards: recYards, rec_tds: recTDs,
      ...defStatDefaults,
    });
  });

  return stats;
}

// ─── Defensive Stats ──────────────────────────────────────────────────────────

function generateDefensiveStats(
  teamId: number,
  opponentQBInts: number,
  defenseRating: number
): GamePlayerStat[] {
  const stats: GamePlayerStat[] = [];
  const defFactor = defenseRating / 75;

  const dls = getHealthyByGroup(teamId, 'DL', 4);
  const lbs = getHealthyByGroup(teamId, 'LB', 4);
  const cbs = getHealthyByGroup(teamId, 'CB', 3);
  const ss  = getHealthyByGroup(teamId, 'S',  2);
  const dbs = [...cbs, ...ss];
  const allDef = [...dls, ...lbs, ...cbs, ...ss];
  if (allDef.length === 0) return [];

  const totalTackles = clamp(randomNormal(38, 5), 25, 52);
  const totalSacks   = clampFloat(randomNormal(3.0 * defFactor, 1.2), 0, 8);
  const totalPDs     = clamp(randomNormal(6 * defFactor, 2), 1, 14);
  const totalINTs    = opponentQBInts;

  const pTackles: Record<number,number> = {};
  const pAssists: Record<number,number> = {};
  const pSacks:   Record<number,number> = {};
  const pTFL:     Record<number,number> = {};
  const pPDs:     Record<number,number> = {};
  const pINTs:    Record<number,number> = {};
  const pFFs:     Record<number,number> = {};
  const pFRs:     Record<number,number> = {};
  const pDTDs:    Record<number,number> = {};

  allDef.forEach(p => {
    pTackles[p.id] = 0; pAssists[p.id] = 0; pSacks[p.id] = 0;
    pTFL[p.id] = 0; pPDs[p.id] = 0; pINTs[p.id] = 0;
    pFFs[p.id] = 0; pFRs[p.id] = 0; pDTDs[p.id] = 0;
  });

  const tackleGroups = [
    { players: lbs, share: 0.38, max: 8 },
    { players: dls, share: 0.25, max: 6 },
    { players: cbs, share: 0.22, max: 5 },
    { players: ss,  share: 0.15, max: 5 },
  ];
  for (const { players, share, max } of tackleGroups) {
    if (!players.length) continue;
    const groupTotal = Math.round(totalTackles * share);
    const weights    = players.map(p => attr(p, 'tackle_rating') / 75);
    const wTotal     = weights.reduce((a, b) => a + b, 0) || 1;
    players.forEach((p, i) => {
      pTackles[p.id] = clamp(randomNormal((groupTotal * weights[i] / wTotal), 2), 0, max);
      pAssists[p.id] = clamp(randomNormal(pTackles[p.id] * 0.35, 1), 0, 4);
    });
  }

  const passRushers = [...dls, ...lbs].sort((a, b) => b.overall_rating - a.overall_rating);
  let remSacks = totalSacks;
  passRushers.forEach(p => {
    if (remSacks <= 0) return;
    const rushBonus = Math.max(0, (attr(p, 'pass_rush') - 70) * 0.008);
    if (Math.random() < 0.32 + rushBonus) {
      const s = Math.min(remSacks, Math.random() < 0.12 ? 2 : Math.random() < 0.72 ? 1 : 0.5);
      pSacks[p.id] = s;
      pTFL[p.id]   = s + (Math.random() < 0.35 ? 1 : 0);
      remSacks -= s;
    }
  });

  const shuffledDBs = [...dbs].sort(() => Math.random() - 0.5);
  let remINTs = totalINTs;
  for (const p of shuffledDBs) {
    if (remINTs <= 0) break;
    const covProb = Math.max(0.15, Math.min(0.55, 0.25 + (attr(p, 'coverage') - 75) * 0.006));
    if (Math.random() < covProb) {
      pINTs[p.id] = 1;
      // Pick-6: ~12% chance per INT
      if (Math.random() < 0.12) pDTDs[p.id] = 1;
      remINTs--;
    }
  }

  let remPDs = totalPDs;
  dbs.forEach(p => {
    if (remPDs <= 0) return;
    const pd = clamp(randomNormal((remPDs / dbs.length) * (attr(p, 'coverage') / 75), 1.0), 0, 4);
    pPDs[p.id] = pd;
    remPDs -= pd;
  });

  // Forced fumbles & fumble return TDs
  if (Math.random() < 0.30 && allDef.length > 0)
    pFFs[allDef[Math.floor(Math.random() * allDef.length)].id] = 1;
  if (Math.random() < 0.20 && allDef.length > 0) {
    const rec = allDef[Math.floor(Math.random() * allDef.length)];
    pFRs[rec.id] = 1;
    if (Math.random() < 0.12) pDTDs[rec.id] = 1;
  }

  for (const p of allDef) {
    const tackles = pTackles[p.id] || 0;
    const sacks   = pSacks[p.id]   || 0;
    const ints    = pINTs[p.id]    || 0;
    const pds     = pPDs[p.id]     || 0;
    const ffs     = pFFs[p.id]     || 0;
    if (tackles === 0 && sacks === 0 && ints === 0 && pds === 0 && ffs === 0) continue;

        stats.push({
      player_id: p.id, team_id: teamId,
      pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
      rush_attempts: 0, rush_yards: 0, rush_tds: 0,
      targets: 0, receptions: 0, rec_yards: 0, rec_tds: 0,
      tackles,
      assisted_tackles: pAssists[p.id] || 0,
      sacks, tfl: pTFL[p.id] || 0,
      forced_fumbles: ffs,
      fumble_recoveries: pFRs[p.id] || 0,
      def_interceptions: ints,
      pass_deflections:  pds,
      def_tds: pDTDs[p.id] || 0,
      fg_made: 0, fg_att: 0, xp_made: 0, xp_att: 0,
    });
  }

  return stats;
}

// ─── Kicker Stats ─────────────────────────────────────────────────────────────

function generateKickerStats(
  teamId: number,
  events: ScoringEvents,
  offensiveTDs: number
): GamePlayerStat | null {
  const ks = getHealthyByGroup(teamId, 'K', 1);
  if (!ks.length) return null;
  const k = ks[0];

  const fg_made = events.fgs;
  // Occasionally there was a missed attempt not captured in scoring events
  const fg_att = fg_made + (Math.random() < 0.18 ? 1 : 0);
  const xp_att = offensiveTDs;
  const xp_made = xp_att > 0 && Math.random() < 0.02 ? xp_att - 1 : xp_att;

  if (fg_att === 0 && xp_att === 0) return null;

  return {
    player_id: k.id, team_id: teamId,
    pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
    rush_attempts: 0, rush_yards: 0, rush_tds: 0,
    targets: 0, receptions: 0, rec_yards: 0, rec_tds: 0,
    tackles: 0, assisted_tackles: 0, sacks: 0, tfl: 0,
    forced_fumbles: 0, fumble_recoveries: 0,
    def_interceptions: 0, pass_deflections: 0, def_tds: 0,
    fg_made, fg_att, xp_made, xp_att,
  };
}

// ─── Quarter Distribution ─────────────────────────────────────────────────────

function distributeToQuarters(total: number): number[] {
  const quarters = [0, 0, 0, 0];
  // Slight Q2/Q4 weight — games tend to have more action late in each half
  const qWeights = [0.21, 0.28, 0.21, 0.30];
  let remaining = total;
  while (remaining >= 2) {
    let pts: number;
    if (remaining >= 7 && Math.random() < 0.55) pts = 7;
    else if (remaining >= 3 && Math.random() < 0.85) pts = 3;
    else pts = 2;
    const r = Math.random();
    let q = 3, cum = 0;
    for (let i = 0; i < 4; i++) { cum += qWeights[i]; if (r < cum) { q = i; break; } }
    quarters[q] += pts;
    remaining -= pts;
  }
  if (remaining > 0) quarters[Math.floor(Math.random() * 4)] += remaining;
  return quarters;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function simulateGame(
  homeTeamId: number,
  awayTeamId: number,
  week: number = 9,
  userTeamId: number = -1,
  difficultyFactor: number = 0
): SimResult {
  const homeRatings = getTeamRatings(homeTeamId);
  const awayRatings = getTeamRatings(awayTeamId);

  if (difficultyFactor !== 0) {
    if (homeTeamId === userTeamId) {
      homeRatings.offenseRating = Math.max(1, homeRatings.offenseRating + difficultyFactor);
      homeRatings.defenseRating = Math.max(1, homeRatings.defenseRating + difficultyFactor);
    }
    if (awayTeamId === userTeamId) {
      awayRatings.offenseRating = Math.max(1, awayRatings.offenseRating + difficultyFactor);
      awayRatings.defenseRating = Math.max(1, awayRatings.defenseRating + difficultyFactor);
    }
  }

  const weather = getWeather(week);
  const wx      = weatherMultipliers(weather);

  // ── Step 1: Generate scoring events (stats-first approach) ────────────────
  const homeEvents = generateScoringEvents(homeRatings.offenseRating, awayRatings.defenseRating, wx, true);
  const awayEvents = generateScoringEvents(awayRatings.offenseRating, homeRatings.defenseRating, wx, false);

  // ── Step 2: Preliminary scores (before defensive TDs) ────────────────────
  let homeScore = homeEvents.tds * 7 + homeEvents.fgs * 3;
  let awayScore = awayEvents.tds * 7 + awayEvents.fgs * 3;

  // ── Step 3: Generate offensive stats with game script ─────────────────────
  const scoreDiff = homeScore - awayScore;
  const homeOffStats = generatePlayerStats(homeTeamId, homeEvents, homeRatings.offenseRating, wx, true,   scoreDiff);
  const awayOffStats = generatePlayerStats(awayTeamId, awayEvents, awayRatings.offenseRating, wx, false, -scoreDiff);

  // ── Step 4: Generate defensive stats ─────────────────────────────────────
  const homeQBInts = homeOffStats.find(s => s.pass_attempts > 0)?.interceptions ?? 0;
  const awayQBInts = awayOffStats.find(s => s.pass_attempts > 0)?.interceptions ?? 0;

  const homeDefStats = generateDefensiveStats(homeTeamId, awayQBInts, homeRatings.defenseRating);
  const awayDefStats = generateDefensiveStats(awayTeamId, homeQBInts, awayRatings.defenseRating);

  // ── Step 5: Add defensive TDs to the DEFENSIVE team's score ──────────────
  const homeDefTDs = homeDefStats.reduce((sum, s) => sum + (s.def_tds ?? 0), 0);
  const awayDefTDs = awayDefStats.reduce((sum, s) => sum + (s.def_tds ?? 0), 0);
  homeScore += homeDefTDs * 6; // ~6 pts avg (no guaranteed PAT)
  awayScore += awayDefTDs * 6;

  // ── Step 6: Overtime ──────────────────────────────────────────────────────
  if (homeScore === awayScore) {
    const ot = simulateOvertime(homeRatings, awayRatings, wx);
    homeScore += ot.homeOTScore;
    awayScore += ot.awayOTScore;
  }

  // ── Step 7: Final sanity — no ties allowed ────────────────────────────────
  if (homeScore === awayScore) {
    if (Math.random() > 0.5) homeScore += 3;
    else awayScore += 3;
  }

    const homeKickerStat = generateKickerStats(homeTeamId, homeEvents, homeEvents.tds);
  const awayKickerStat = generateKickerStats(awayTeamId, awayEvents, awayEvents.tds);

  return {
    homeScore, awayScore,
    homeQuarters: distributeToQuarters(homeScore),
    awayQuarters: distributeToQuarters(awayScore),
    weather,
    homePlayerStats: [...homeOffStats, ...homeDefStats, ...(homeKickerStat ? [homeKickerStat] : [])],
    awayPlayerStats: [...awayOffStats, ...awayDefStats, ...(awayKickerStat ? [awayKickerStat] : [])],
  };
}
