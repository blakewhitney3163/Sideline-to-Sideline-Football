const { db } = require('./database');
import type { PlayerStats } from './types';

// ─── Local Types ──────────────────────────────────────────────────────────────

type WeatherType = 'clear' | 'rain' | 'wind' | 'snow';

interface PlayerRow {
  id: number;
  overall_rating: number;
  speed: number | null;
  strength: number | null;
  awareness: number | null;
  throw_accuracy: number | null;
  throw_power: number | null;
  catching: number | null;
  route_running: number | null;
  tackle_rating: number | null;
  coverage: number | null;
  pass_rush: number | null;
}

interface TeamRatings {
  offenseRating: number;
  defenseRating: number;
}

interface WeatherMultipliers {
  score: number;
  passYards: number;
  compPct: number;
  rushYards: number;
  rushAttempts: number;
}

export type GamePlayerStat = Omit<PlayerStats, 'game_id'>;

export interface SimResult {
  homeScore: number;
  awayScore: number;
  homeQuarters: number[];
  awayQuarters: number[];
  weather: WeatherType;
  homePlayerStats: GamePlayerStat[];
  awayPlayerStats: GamePlayerStat[];
}

// ─── Math Helpers ─────────────────────────────────────────────────────────────

function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

function clampFloat(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val * 2) / 2));
}

function attr(p: PlayerRow, col: keyof Omit<PlayerRow, 'id'>, fallback: number = 70): number {
  return (p[col] as number | null) ?? fallback;
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

function getHealthyByGroup(teamId: number, positionGroup: string, limit: number): PlayerRow[] {
  const cols = `p.id, p.overall_rating, p.speed, p.strength, p.awareness,
    p.throw_accuracy, p.throw_power, p.catching, p.route_running,
    p.tackle_rating, p.coverage, p.pass_rush`;
  const rows = db.prepare(`
    SELECT ${cols}
    FROM depth_chart dc
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
    SELECT position, overall_rating FROM players
    WHERE team_id = ? AND injury_status NOT IN ('out', 'ir')
  `).all(teamId) as { position: string; overall_rating: number }[];
  const offense = players.filter(p => ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.position));
  const defense = players.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.position));
  const offenseRating = offense.reduce((sum, p) => sum + p.overall_rating, 0) / (offense.length || 1);
  const defenseRating = defense.reduce((sum, p) => sum + p.overall_rating, 0) / (defense.length || 1);
  return { offenseRating, defenseRating };
}

// ─── Weather ──────────────────────────────────────────────────────────────────

function getWeather(week: number): WeatherType {
  const lateSeasonFactor = Math.max(0, (week - 8) / 9);
  const rand = Math.random();
  if (rand < 0.05 + lateSeasonFactor * 0.15) return 'snow';
  if (rand < 0.15 + lateSeasonFactor * 0.20) return 'rain';
  if (rand < 0.25 + lateSeasonFactor * 0.10) return 'wind';
  return 'clear';
}

function weatherMultipliers(weather: WeatherType): WeatherMultipliers {
  switch (weather) {
    case 'snow': return { score: 0.84, passYards: 0.74, compPct: -0.07, rushYards: 1.06, rushAttempts: 1.08 };
    case 'rain': return { score: 0.92, passYards: 0.87, compPct: -0.03, rushYards: 1.02, rushAttempts: 1.04 };
    case 'wind': return { score: 0.90, passYards: 0.80, compPct: -0.05, rushYards: 1.00, rushAttempts: 1.02 };
    default:     return { score: 1.00, passYards: 1.00, compPct: 0.00,  rushYards: 1.00, rushAttempts: 1.00 };
  }
}

// ─── Player Stats Generation ──────────────────────────────────────────────────

function generatePlayerStats(
  teamId: number,
  score: number,
  offenseRating: number,
  wx: WeatherMultipliers,
  isHome: boolean
): GamePlayerStat[] {
  const stats: GamePlayerStat[] = [];
  const teamRatingFactor = offenseRating / 75;

  const qbs = getHealthyByGroup(teamId, 'QB', 1);
  const rbs = getHealthyByGroup(teamId, 'RB', 3);
  const wrs = getHealthyByGroup(teamId, 'WR', 4);
  const tes = getHealthyByGroup(teamId, 'TE', 2);
  const qb = qbs[0] ?? null;

  const fgCount = clamp(randomNormal(1.5, 0.9), 0, Math.max(0, Math.floor((score - 7) / 3)));
  const totalTDs = Math.max(0, Math.round((score - fgCount * 3) / 7));
  const passTDs = clamp(Math.round(totalTDs * 0.72), 0, totalTDs);
  const rushTDs = totalTDs - passTDs;

  const defStatDefaults = {
    tackles: 0, assisted_tackles: 0, sacks: 0, tfl: 0,
    forced_fumbles: 0, fumble_recoveries: 0,
    def_interceptions: 0, pass_deflections: 0, def_tds: 0,
  };

  // ── QB ──────────────────────────────────────────────────────────────────────
  let passYardsGenerated = 250 * teamRatingFactor;
  if (qb) {
    const qbRatingFactor = qb.overall_rating / 75;
    const combinedFactor = (teamRatingFactor + qbRatingFactor) / 2;
    const powerBonus = (attr(qb, 'throw_power') - 75) * 0.8;
    passYardsGenerated = clamp(randomNormal((220 + powerBonus) * combinedFactor, 50) * wx.passYards, 40, 420);

    const passAttempts = clamp(randomNormal(34, 5), 20, 55);
    const throwAcc = attr(qb, 'throw_accuracy');
    const homePenalty = isHome ? 0.012 : -0.018;
    const compPct = Math.min(0.78, Math.max(0.42,
      0.55 + (throwAcc - 70) * 0.004 + homePenalty + wx.compPct + randomNormal(0, 0.035)
    ));
    const completions = clamp(passAttempts * compPct, 8, passAttempts);
    const intMean = Math.max(0.05,
      1.4 - (throwAcc / 100) * 0.6 - (attr(qb, 'awareness') / 100) * 0.35
      + (isHome ? -0.05 : 0.1)
    );
    const ints = clamp(randomNormal(intMean, 0.6), 0, 4);
    const qbCarries = Math.random() > 0.6 ? clamp(randomNormal(4, 2), 0, 8) : 0;

    stats.push({
      player_id: qb.id, team_id: teamId,
      pass_attempts: passAttempts, completions, pass_yards: passYardsGenerated,
      pass_tds: passTDs, interceptions: ints,
      rush_attempts: qbCarries,
      rush_yards: clamp(randomNormal(qbCarries * 5, 8), 0, 50), rush_tds: 0,
      targets: 0, receptions: 0, rec_yards: 0, rec_tds: 0,
      ...defStatDefaults,
    });
  }

  // ── RBs ─────────────────────────────────────────────────────────────────────
  const totalRushAttempts = clamp(randomNormal(26 * wx.rushAttempts, 5), 14, 45);
  const rbRatingWeights = rbs.map(rb => rb.overall_rating / 75);
  const rbWeightTotal = rbRatingWeights.reduce((a, b) => a + b, 0) || 1;
  const rb1Rating = rbs[0]?.overall_rating ?? 70;
  const rb2Rating = rbs[1]?.overall_rating ?? 60;
  const workhorseBonus = Math.max(0, (rb1Rating - rb2Rating) / 10) * 0.06;

  rbs.forEach((rb, i) => {
    const baseShare = rbRatingWeights[i] / rbWeightTotal;
    const adjustedShare = i === 0 ? baseShare + workhorseBonus : baseShare - workhorseBonus / (rbs.length - 1 || 1);
    const share = clamp(randomNormal(adjustedShare * 100, 8), i === 0 ? 25 : 0, 82) / 100;
    const carries = clamp(totalRushAttempts * share, i === 0 ? 6 : 0, 35);
    const speedFactor = (attr(rb, 'speed') - 70) * 0.03;
    const ypc = Math.max(2.5, randomNormal((4.2 + speedFactor) * wx.rushYards, 0.8));
    const rushYards = clamp(carries * ypc, 0, 230);
    const rbRushTDs = i === 0 && rushTDs > 0 ? Math.ceil(rushTDs * 0.75) :
      i === 1 && rushTDs > 1 && Math.random() < 0.3 ? 1 : 0;

    stats.push({
      player_id: rb.id, team_id: teamId,
      pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
      rush_attempts: carries, rush_yards: rushYards, rush_tds: rbRushTDs,
      targets: clamp(randomNormal(4 - i * 1.5, 2), 0, 8),
      receptions: clamp(randomNormal(3 - i, 1), 0, 6),
      rec_yards: clamp(randomNormal(28 - i * 8, 12), 0, 65),
      rec_tds: 0,
      ...defStatDefaults,
    });
  });

  // ── WRs + TEs ────────────────────────────────────────────────────────────────
  const receivers = [...wrs, ...tes];
  const actualCount = receivers.length;

  function buildSlotBias(count: number): number[] {
    const biases: number[] = [];
    for (let i = 0; i < count; i++) {
      const isTe = i >= wrs.length;
      if (isTe) {
        biases.push(0.85 - (i - wrs.length) * 0.25);
      } else {
        const base = 1.30 - i * (0.30 / Math.max(1, wrs.length - 1));
        biases.push(Math.max(0.30, base));
      }
    }
    return biases;
  }

  const slotBias = buildSlotBias(actualCount);
  const recPowerWeights = receivers.map((r, i) =>
    Math.pow(attr(r, 'route_running') / 75, 2.2) * (slotBias[i] ?? 0.30)
  );
  const recPowerTotal = recPowerWeights.reduce((a, b) => a + b, 0) || 1;
  let remainingRecTDs = passTDs;

  const noisyWeights = recPowerWeights.map(w => Math.max(0.01, w + randomNormal(0, w * 0.3)));
  const noisyTotal = noisyWeights.reduce((a, b) => a + b, 0) || 1;

  receivers.forEach((rec, i) => {
    const powerShare = noisyWeights[i] / noisyTotal;
    const recYards = clamp(Math.round(passYardsGenerated * powerShare), 0, 250);
    const ratingFactor = rec.overall_rating / 75;
    const baseTargets = i === 0 ? 9 * ratingFactor : (8 * ratingFactor) - i * 0.8;
    const targets = clamp(randomNormal(baseTargets, 2), i === 0 ? 2 : 0, 16);
    const catchingAttr = attr(rec, 'catching');
    const catchRate = Math.min(0.83, Math.max(0.42,
      0.50 + (catchingAttr - 65) * 0.006 + randomNormal(0, 0.04)
    ));
    const recs = clamp(targets * catchRate, 0, targets);
    const tdThreshold = 0.6 - (rec.overall_rating - 70) * 0.005;
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
  const ss  = getHealthyByGroup(teamId, 'S', 2);
  const dbs = [...cbs, ...ss];
  const allDef = [...dls, ...lbs, ...cbs, ...ss];
  if (allDef.length === 0) return [];

  const totalTackles = clamp(randomNormal(38, 5), 25, 52);
  const totalSacks   = clampFloat(randomNormal(3.0 * defFactor, 1.2), 0, 8);
  const totalPDs     = clamp(randomNormal(6 * defFactor, 2), 1, 14);
  const totalINTs    = opponentQBInts;

  const pTackles: Record<number, number> = {};
  const pAssists: Record<number, number> = {};
  const pSacks:   Record<number, number> = {};
  const pTFL:     Record<number, number> = {};
  const pPDs:     Record<number, number> = {};
  const pINTs:    Record<number, number> = {};
  const pFFs:     Record<number, number> = {};
  const pFRs:     Record<number, number> = {};
  const pDTDs:    Record<number, number> = {};

  allDef.forEach(p => {
    pTackles[p.id] = 0; pAssists[p.id] = 0; pSacks[p.id] = 0;
    pTFL[p.id] = 0; pPDs[p.id] = 0; pINTs[p.id] = 0;
    pFFs[p.id] = 0; pFRs[p.id] = 0; pDTDs[p.id] = 0;
  });

  const tackleGroups: { players: PlayerRow[]; share: number; max: number }[] = [
    { players: lbs, share: 0.38, max: 8 },
    { players: dls, share: 0.25, max: 6 },
    { players: cbs, share: 0.22, max: 5 },
    { players: ss,  share: 0.15, max: 5 },
  ];
  for (const { players, share, max } of tackleGroups) {
    if (!players.length) continue;
    const groupTotal = Math.round(totalTackles * share);
    const weights = players.map(p => attr(p, 'tackle_rating') / 75);
    const wTotal = weights.reduce((a, b) => a + b, 0) || 1;
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
      if (Math.random() < 0.12) pDTDs[p.id] = 1;
      remINTs--;
    }
  }

  let remPDs = totalPDs;
  dbs.forEach(p => {
    if (remPDs <= 0) return;
    const covWeight = attr(p, 'coverage') / 75;
    const pd = clamp(randomNormal((remPDs / dbs.length) * covWeight, 1.0), 0, 4);
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
      sacks,
      tfl:              pTFL[p.id]     || 0,
      forced_fumbles:   ffs,
      fumble_recoveries: pFRs[p.id]   || 0,
      def_interceptions: ints,
      pass_deflections:  pds,
      def_tds:           pDTDs[p.id]  || 0,
    });
  }

  return stats;
}

function distributeToQuarters(total: number): number[] {
  const quarters = [0, 0, 0, 0];
  let remaining = total;
  while (remaining >= 2) {
    let pts: number;
    if (remaining >= 7 && Math.random() < 0.55) pts = 7;
    else if (remaining >= 3 && Math.random() < 0.85) pts = 3;
    else pts = 2;
    quarters[Math.floor(Math.random() * 4)] += pts;
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
  const wx = weatherMultipliers(weather);
  const leagueAvg = 23;
  const homefieldAdvantage = 3.0;

  let homeScore = Math.round(randomNormal(
    (homeRatings.offenseRating / awayRatings.defenseRating) * leagueAvg * wx.score + homefieldAdvantage, 7
  ));
  let awayScore = Math.round(randomNormal(
    (awayRatings.offenseRating / homeRatings.defenseRating) * leagueAvg * wx.score, 7
  ));
  homeScore = Math.max(0, homeScore);
  awayScore = Math.max(0, awayScore);
  if (homeScore === awayScore) awayScore = Math.random() > 0.5 ? awayScore + 3 : Math.max(0, awayScore - 3);

  const homeOffStats = generatePlayerStats(homeTeamId, homeScore, homeRatings.offenseRating, wx, true);
  const awayOffStats = generatePlayerStats(awayTeamId, awayScore, awayRatings.offenseRating, wx, false);

  const homeQBInts = homeOffStats.find(s => s.pass_attempts > 0)?.interceptions ?? 0;
  const awayQBInts = awayOffStats.find(s => s.pass_attempts > 0)?.interceptions ?? 0;

  const homeDefStats = generateDefensiveStats(homeTeamId, awayQBInts, homeRatings.defenseRating);
  const awayDefStats = generateDefensiveStats(awayTeamId, homeQBInts, awayRatings.defenseRating);

  return {
    homeScore, awayScore,
    homeQuarters: distributeToQuarters(homeScore),
    awayQuarters: distributeToQuarters(awayScore),
    weather,
    homePlayerStats: [...homeOffStats, ...homeDefStats],
    awayPlayerStats: [...awayOffStats, ...awayDefStats],
  };
}
