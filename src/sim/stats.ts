import type { TeamData, ScoringEvents, WeatherMultipliers, GamePlayerStat } from './types';
import { byPos, randomNormal, clamp, clampFloat, attr } from './ratings';

// ─── Offensive Stats ──────────────────────────────────────────────────────────

export function generatePlayerStats(
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

  // ── QB ──────────────────────────────────────────────────────────────────────
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

  // ── RBs ─────────────────────────────────────────────────────────────────────
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

  // ── WRs + TEs ───────────────────────────────────────────────────────────────
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

export function generateDefensiveStats(
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

export function generateKickerStats(
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
