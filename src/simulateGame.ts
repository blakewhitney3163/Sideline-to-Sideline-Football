const { db } = require('./database');
import type { PlayerStats } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

type WeatherType = 'clear' | 'rain' | 'wind' | 'snow';

interface PlayerRow {
  id: number;
  position: string;
  overall_rating: number;
  morale: number;
  depth_slot: number;
  speed: number | null; strength: number | null; awareness: number | null;
  throw_accuracy: number | null; throw_power: number | null;
  catching: number | null; route_running: number | null;
  tackle_rating: number | null; coverage: number | null; pass_rush: number | null;
}

interface CoachRow { role: string; overall_rating: number; offense_rating: number; defense_rating: number; }
interface SchemeRow { offense_scheme: string; defense_scheme: string; }

interface TeamData {
  teamId: number;
  players: PlayerRow[];
  coaches: CoachRow[];
  scheme: SchemeRow | null;
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

function attr(p: PlayerRow, col: keyof Omit<PlayerRow, 'id' | 'position' | 'depth_slot'>, fallback = 70): number {
  return (p[col] as number | null) ?? fallback;
}

// ─── Team Data Loader — 3 queries per team replaces ~15–25 per-game queries ───

function loadTeamData(teamId: number): TeamData {
  const players = db.prepare(`
    SELECT p.id, p.position,
           p.overall_rating, COALESCE(p.morale, 75) AS morale,
           p.speed, p.strength, p.awareness,
           p.throw_accuracy, p.throw_power,
           p.catching, p.route_running,
           p.tackle_rating, p.coverage, p.pass_rush,
           COALESCE(dc.slot, 999) AS depth_slot
    FROM players p
    LEFT JOIN depth_chart dc ON dc.player_id = p.id AND dc.team_id = ?
    WHERE p.team_id = ? AND p.roster_status = 'active'
      AND p.injury_status NOT IN ('out', 'ir')
    ORDER BY
      CASE p.position
        WHEN 'QB' THEN 1 WHEN 'RB' THEN 2 WHEN 'WR' THEN 3 WHEN 'TE' THEN 4
        WHEN 'OL' THEN 5 WHEN 'DL' THEN 6 WHEN 'LB' THEN 7
        WHEN 'CB' THEN 8 WHEN 'S'  THEN 9 WHEN 'K'  THEN 10 ELSE 11
      END, COALESCE(dc.slot, 999) ASC, p.overall_rating DESC
  `).all(teamId, teamId) as PlayerRow[];

  let coaches: CoachRow[] = [];
  try {
    coaches = db.prepare(
      "SELECT role, overall_rating, offense_rating, defense_rating FROM coaching_staff WHERE team_id = ? AND role IN ('HC','OC','DC')"
    ).all(teamId) as CoachRow[];
  } catch { /* coaching_staff not yet on this save */ }

  let scheme: SchemeRow | null = null;
  try {
    scheme = db.prepare(
      'SELECT offense_scheme, defense_scheme FROM team_schemes WHERE team_id = ?'
    ).get(teamId) as SchemeRow ?? null;
  } catch { /* team_schemes not yet on this save */ }

  return { teamId, players, coaches, scheme };
}

// ─── In-Memory Position Filter (replaces all getHealthyByGroup DB calls) ──────

function byPos(players: PlayerRow[], position: string, limit: number): PlayerRow[] {
  return players
    .filter(p => p.position === position)
    .sort((a, b) => a.depth_slot - b.depth_slot || b.overall_rating - a.overall_rating)
    .slice(0, limit);
}

// ─── Team Ratings (fully in-memory, zero additional DB calls) ─────────────────

function computeTeamRatings(data: TeamData): TeamRatings {
  const { players, coaches, scheme } = data;

  const effOvr = (p: PlayerRow) => p.overall_rating * (1 + (p.morale - 75) * 0.001);

  const offense = players.filter(p => ['QB','RB','WR','TE','OL'].includes(p.position));
  const defense = players.filter(p => ['DL','LB','CB','S'].includes(p.position));

  let offenseRating = offense.reduce((s, p) => s + effOvr(p), 0) / (offense.length || 1);
  let defenseRating = defense.reduce((s, p) => s + effOvr(p), 0) / (defense.length || 1);

  // Coaching modifiers
  const hc = coaches.find(c => c.role === 'HC');
  const oc = coaches.find(c => c.role === 'OC');
  const dc = coaches.find(c => c.role === 'DC');
  if (hc) { offenseRating += (hc.overall_rating - 70) * 0.05; defenseRating += (hc.overall_rating - 70) * 0.05; }
  if (oc) offenseRating += (oc.offense_rating - 70) * 0.15;
  if (dc) defenseRating += (dc.defense_rating - 70) * 0.15;

  // Scheme modifiers — computed in-memory from pre-loaded players
  if (scheme) {
    const topN = (arr: PlayerRow[], n: number) =>
      [...arr].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, n);
    const avg = (arr: PlayerRow[], key: keyof PlayerRow, fallback = 70): number =>
      arr.length ? arr.reduce((s, p) => s + ((p[key] as number) ?? fallback), 0) / arr.length : fallback;

    const qbs = players.filter(p => p.position === 'QB').sort((a, b) => b.overall_rating - a.overall_rating);
    const rbs = players.filter(p => p.position === 'RB');
    const wrs = players.filter(p => p.position === 'WR');
    const tes = players.filter(p => p.position === 'TE');
    const ols = players.filter(p => p.position === 'OL');
    const dls = players.filter(p => p.position === 'DL');
    const lbs = players.filter(p => p.position === 'LB');
    const cbs = players.filter(p => p.position === 'CB');
    const ss  = players.filter(p => p.position === 'S');

    let offMod = 0, defMod = 0;

    switch (scheme.offense_scheme) {
      case 'West Coast': {
        const qbAcc = qbs[0]?.throw_accuracy ?? 70;
        const teAvg = avg(topN(tes, 2), 'overall_rating');
        offMod = ((qbAcc + teAvg) / 2 - 70) * 0.08;
        break;
      }
      case 'Air Raid':
        offMod = (avg(topN(wrs, 3), 'overall_rating') - 70) * 0.14;
        break;
      case 'Power Run': {
        const rbAvg = avg(topN(rbs, 2), 'overall_rating');
        const olAvg = avg(topN(ols, 5), 'overall_rating');
        offMod = ((rbAvg + olAvg) / 2 - 70) * 0.12;
        break;
      }
      case 'Spread': {
        const topQb = qbs[0];
        const qbCombo = topQb ? ((topQb.throw_accuracy ?? 70) + (topQb.speed ?? 60)) / 2 : 65;
        offMod = (qbCombo - 70) * 0.10;
        break;
      }
      case 'Run & Gun':
        offMod = (avg(offense, 'overall_rating') - 70) * 0.07;
        break;
    }

    switch (scheme.defense_scheme) {
      case '4-3':
        defMod = (avg(topN(dls, 4), 'overall_rating') - 70) * 0.12;
        break;
      case '3-4':
        defMod = (avg(topN(lbs, 4), 'overall_rating') - 70) * 0.13;
        break;
      case 'Zone Cover 2': {
        const dbAll = [...topN(cbs, 3), ...topN(ss, 2)];
        defMod = (avg(dbAll, 'coverage') - 70) * 0.11;
        break;
      }
      case 'Man Press':
        defMod = (avg(topN(cbs, 2), 'overall_rating') - 70) * 0.11;
        break;
      case 'Blitz Heavy': {
        const rushers = [...dls, ...lbs].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, 6);
        defMod = (avg(rushers, 'pass_rush') - 70) * 0.15;
        break;
      }
    }

    offenseRating += offMod;
    defenseRating += defMod;
  }

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

function generateScoringEvents(
  offenseRating: number,
  defenseRating: number,
  wx: WeatherMultipliers,
  isHome: boolean
): ScoringEvents {
  const efficiencyRatio = (offenseRating / Math.max(defenseRating, 50)) * wx.score;
  const baseDrives = isHome ? 4.4 : 3.9;
  const scoringDrives = Math.max(0, Math.round(randomNormal(baseDrives * efficiencyRatio, 1.1)));

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

// ─── Overtime ─────────────────────────────────────────────────────────────────

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
  if (r1 === 'td') return homeFirst ? { homeOTScore: 7, awayOTScore: 0 } : { homeOTScore: 0, awayOTScore: 7 };
  if (r1 === 'fg') {
    const r2 = possession(secondOff.offenseRating, firstOff.defenseRating);
    if (r2 === 'td') return homeFirst ? { homeOTScore: 3, awayOTScore: 7 } : { homeOTScore: 7, awayOTScore: 3 };
    if (r2 === 'fg') return Math.random() > 0.5
      ? (homeFirst ? { homeOTScore: 6, awayOTScore: 3 } : { homeOTScore: 3, awayOTScore: 6 })
      : (homeFirst ? { homeOTScore: 3, awayOTScore: 6 } : { homeOTScore: 6, awayOTScore: 3 });
    return homeFirst ? { homeOTScore: 3, awayOTScore: 0 } : { homeOTScore: 0, awayOTScore: 3 };
  }
  const r2 = possession(secondOff.offenseRating, firstOff.defenseRating);
  if (r2 !== 'none') {
    const pts = r2 === 'td' ? 7 : 3;
    return homeFirst ? { homeOTScore: 0, awayOTScore: pts } : { homeOTScore: pts, awayOTScore: 0 };
  }
  return { homeOTScore: 3, awayOTScore: 0 };
}

// ─── Offensive Stats ──────────────────────────────────────────────────────────

function generatePlayerStats(
  data: TeamData,
  events: ScoringEvents,
  offenseRating: number,
  wx: WeatherMultipliers,
  isHome: boolean,
  scoreDiff: number
): GamePlayerStat[] {
  const { teamId, players } = data;
  const stats: GamePlayerStat[] = [];
  const teamRatingFactor = offenseRating / 75;

  const gameScriptPassMod = scoreDiff < -14 ? 1.20 : scoreDiff < -7 ? 1.10 : scoreDiff > 14 ? 0.88 : 1.0;
  const gameScriptRushMod = scoreDiff > 14 ? 1.15 : scoreDiff > 7 ? 1.08 : scoreDiff < -14 ? 0.85 : 1.0;

  const passTDs = clamp(Math.round(events.tds * 0.72), 0, events.tds);
  const rushTDs = events.tds - passTDs;

  const qbs = byPos(players, 'QB', 1);
  const rbs = byPos(players, 'RB', 3);
  const wrs = byPos(players, 'WR', 4);
  const tes = byPos(players, 'TE', 2);
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
    const qbRatingFactor = qb.overall_rating / 75;
    const combinedFactor = (teamRatingFactor + qbRatingFactor) / 2;
    const powerBonus = (attr(qb, 'throw_power') - 75) * 0.8;
    const tdYardageBonus = passTDs * 7;

    passYardsGenerated = clamp(
      randomNormal((220 + powerBonus + tdYardageBonus) * combinedFactor, 48)
      * wx.passYards * gameScriptPassMod,
      50, 460
    );

    const passAttempts = clamp(randomNormal(34 * gameScriptPassMod, 5), 18, 60);
    const throwAcc = attr(qb, 'throw_accuracy');
    const homePenalty = isHome ? 0.012 : -0.018;
    const compPct = Math.min(0.78, Math.max(0.42,
      0.55 + (throwAcc - 70) * 0.004 + homePenalty + wx.compPct + randomNormal(0, 0.033)
    ));
    const completions = clamp(passAttempts * compPct, 8, passAttempts);
    const intMean = Math.max(0.04,
      1.4 - (throwAcc / 100) * 0.6 - (attr(qb, 'awareness') / 100) * 0.35
      + (isHome ? -0.05 : 0.10) + (scoreDiff < -14 ? 0.20 : 0)
    );
    const ints = clamp(randomNormal(intMean, 0.6), 0, 4);
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
  const rbWeightTotal = rbRatingWeights.reduce((a, b) => a + b, 0) || 1;
  const rb1Rating = rbs[0]?.overall_rating ?? 70;
  const rb2Rating = rbs[1]?.overall_rating ?? 60;
  const workhorseBonus = Math.max(0, (rb1Rating - rb2Rating) / 10) * 0.06;

  rbs.forEach((rb, i) => {
    const baseShare = rbRatingWeights[i] / rbWeightTotal;
    const adjustedShare = i === 0
      ? baseShare + workhorseBonus
      : baseShare - workhorseBonus / (rbs.length - 1 || 1);
    const share = clamp(randomNormal(adjustedShare * 100, 8), i === 0 ? 25 : 0, 82) / 100;
    const carries = clamp(totalRushAttempts * share, i === 0 ? 6 : 0, 36);
    const speedFactor = (attr(rb, 'speed') - 70) * 0.03;
    const ypc = Math.max(2.4, randomNormal((4.2 + speedFactor) * wx.rushYards, 0.8));
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
  const receivers = [...wrs, ...tes];
  const actualCount = receivers.length;

  function buildSlotBias(count: number): number[] {
    return Array.from({ length: count }, (_, i) => {
      const isTe = i >= wrs.length;
      if (isTe) return Math.max(0.25, 0.85 - (i - wrs.length) * 0.25);
      return Math.max(0.28, 1.30 - i * (0.30 / Math.max(1, wrs.length - 1)));
    });
  }

  const slotBias = buildSlotBias(actualCount);
  const recPowerWeights = receivers.map((r, i) =>
    Math.pow(attr(r, 'route_running') / 75, 2.2) * (slotBias[i] ?? 0.30)
  );
  const recPowerTotal = recPowerWeights.reduce((a, b) => a + b, 0) || 1;
  const noisyWeights = recPowerWeights.map(w => Math.max(0.01, w + randomNormal(0, w * 0.3)));
  const noisyTotal = noisyWeights.reduce((a, b) => a + b, 0) || 1;
  let remainingRecTDs = passTDs;

  receivers.forEach((rec, i) => {
    const powerShare = noisyWeights[i] / noisyTotal;
    const recYards = clamp(Math.round(passYardsGenerated * powerShare), 0, 260);
    const ratingFactor = rec.overall_rating / 75;
    const baseTargets = i === 0 ? 9 * ratingFactor : (8 * ratingFactor) - i * 0.8;
    const targets = clamp(randomNormal(baseTargets, 2), i === 0 ? 2 : 0, 16);
    const catchRate = Math.min(0.83, Math.max(0.42,
      0.50 + (attr(rec, 'catching') - 65) * 0.006 + randomNormal(0, 0.04)
    ));
    const recs = clamp(targets * catchRate, 0, targets);
    const tdThreshold = 0.60 - (rec.overall_rating - 70) * 0.005;
    const recTDs = remainingRecTDs > 0 && Math.random() > tdThreshold ? 1 : 0;
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
  data: TeamData,
  opponentQBInts: number,
  defenseRating: number
): GamePlayerStat[] {
  const { teamId, players } = data;
  const stats: GamePlayerStat[] = [];
  const defFactor = defenseRating / 75;

  const dls = byPos(players, 'DL', 4);
  const lbs = byPos(players, 'LB', 4);
  const cbs = byPos(players, 'CB', 3);
  const ss  = byPos(players, 'S',  2);
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
  for (const { players: grp, share, max } of tackleGroups) {
    if (!grp.length) continue;
    const groupTotal = Math.round(totalTackles * share);
    const weights = grp.map(p => attr(p, 'tackle_rating') / 75);
    const wTotal = weights.reduce((a, b) => a + b, 0) || 1;
    grp.forEach((p, i) => {
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
      pTFL[p.id] = s + (Math.random() < 0.35 ? 1 : 0);
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
      pass_deflections: pds,
      def_tds: pDTDs[p.id] || 0,
      fg_made: 0, fg_att: 0, xp_made: 0, xp_att: 0,
    });
  }

  return stats;
}

// ─── Kicker Stats ─────────────────────────────────────────────────────────────

function generateKickerStats(
  data: TeamData,
  events: ScoringEvents,
  offensiveTDs: number
): GamePlayerStat | null {
  const { teamId, players } = data;
  const ks = byPos(players, 'K', 1);
  if (!ks.length) return null;
  const k = ks[0];

  const fg_made = events.fgs;
  const fg_att  = fg_made + (Math.random() < 0.18 ? 1 : 0);
  const xp_att  = offensiveTDs;
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
  // Load all team data upfront — 3 DB queries per team (6 total per game)
  const homeData = loadTeamData(homeTeamId);
  const awayData = loadTeamData(awayTeamId);

  const homeRatings = computeTeamRatings(homeData);
  const awayRatings = computeTeamRatings(awayData);

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
  const wx = weatherMultipliers(weather);

  const homeEvents = generateScoringEvents(homeRatings.offenseRating, awayRatings.defenseRating, wx, true);
  const awayEvents = generateScoringEvents(awayRatings.offenseRating, homeRatings.defenseRating, wx, false);

  let homeScore = homeEvents.tds * 7 + homeEvents.fgs * 3;
  let awayScore = awayEvents.tds * 7 + awayEvents.fgs * 3;

  const scoreDiff = homeScore - awayScore;
  const homeOffStats = generatePlayerStats(homeData, homeEvents, homeRatings.offenseRating, wx, true, scoreDiff);
  const awayOffStats = generatePlayerStats(awayData, awayEvents, awayRatings.offenseRating, wx, false, -scoreDiff);

  const homeQBInts = homeOffStats.find(s => s.pass_attempts > 0)?.interceptions ?? 0;
  const awayQBInts = awayOffStats.find(s => s.pass_attempts > 0)?.interceptions ?? 0;

  const homeDefStats = generateDefensiveStats(homeData, awayQBInts, homeRatings.defenseRating);
  const awayDefStats = generateDefensiveStats(awayData, homeQBInts, awayRatings.defenseRating);

  const homeDefTDs = homeDefStats.reduce((sum, s) => sum + (s.def_tds ?? 0), 0);
  const awayDefTDs = awayDefStats.reduce((sum, s) => sum + (s.def_tds ?? 0), 0);
  homeScore += homeDefTDs * 6;
  awayScore += awayDefTDs * 6;

  if (homeScore === awayScore) {
    const ot = simulateOvertime(homeRatings, awayRatings, wx);
    homeScore += ot.homeOTScore;
    awayScore += ot.awayOTScore;
  }

  if (homeScore === awayScore) {
    if (Math.random() > 0.5) homeScore += 3;
    else awayScore += 3;
  }

  const homeKickerStat = generateKickerStats(homeData, homeEvents, homeEvents.tds);
  const awayKickerStat = generateKickerStats(awayData, awayEvents, awayEvents.tds);

  return {
    homeScore, awayScore,
    homeQuarters: distributeToQuarters(homeScore),
    awayQuarters: distributeToQuarters(awayScore),
    weather,
    homePlayerStats: [...homeOffStats, ...homeDefStats, ...(homeKickerStat ? [homeKickerStat] : [])],
    awayPlayerStats: [...awayOffStats, ...awayDefStats, ...(awayKickerStat ? [awayKickerStat] : [])],
  };
}
