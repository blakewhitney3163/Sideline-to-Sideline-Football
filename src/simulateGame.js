const { db } = require('./database');

function randomNormal(mean, stdDev) {
  let u1 = Math.random();
  let u2 = Math.random();
  let z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.round(val)));
}

function clampFloat(val, min, max) {
  return Math.max(min, Math.min(max, Math.round(val * 2) / 2));
}

function getHealthyByGroup(teamId, positionGroup, limit) {
  const rows = db.prepare(`
    SELECT p.id, p.overall_rating
    FROM depth_chart dc
    JOIN players p ON dc.player_id = p.id
    WHERE dc.team_id = ? AND dc.position_group = ? AND p.roster_status = 'active'
      AND p.injury_status NOT IN ('out', 'ir')
    ORDER BY dc.slot LIMIT ?
  `).all(teamId, positionGroup, limit);
  if (rows.length > 0) return rows;
  return db.prepare(`
    SELECT id, overall_rating FROM players
    WHERE team_id = ? AND position = ? AND roster_status = 'active'
      AND injury_status NOT IN ('out', 'ir')
    ORDER BY overall_rating DESC LIMIT ?
  `).all(teamId, positionGroup, limit);
}

function getTeamRatings(teamId) {
  const players = db.prepare(`
    SELECT position, overall_rating FROM players
    WHERE team_id = ? AND injury_status NOT IN ('out', 'ir')
  `).all(teamId);
  const offense = players.filter(p => ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.position));
  const defense = players.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.position));
  const offenseRating = offense.reduce((sum, p) => sum + p.overall_rating, 0) / (offense.length || 1);
  const defenseRating = defense.reduce((sum, p) => sum + p.overall_rating, 0) / (defense.length || 1);
  return { offenseRating, defenseRating };
}

function generatePlayerStats(teamId, score, offenseRating) {
  const stats = [];
  const teamRatingFactor = offenseRating / 75;

  const qbs = getHealthyByGroup(teamId, 'QB', 1);
  const rbs = getHealthyByGroup(teamId, 'RB', 2);
  const wrs = getHealthyByGroup(teamId, 'WR', 4);
  const tes = getHealthyByGroup(teamId, 'TE', 2);

  const qb = qbs[0] ?? null;

  const totalTDs = Math.max(0, Math.round(score / 7));
  const passTDs  = clamp(Math.round(totalTDs * 0.6), 0, totalTDs);
  const rushTDs  = totalTDs - passTDs;

  const defStatDefaults = {
    tackles: 0, assisted_tackles: 0, sacks: 0, tfl: 0,
    forced_fumbles: 0, fumble_recoveries: 0,
    def_interceptions: 0, pass_deflections: 0, def_tds: 0,
  };

  // QB — bumped mean to 250 to support realistic receiver totals
  let passYardsGenerated = 250 * teamRatingFactor;
  if (qb) {
    const qbRatingFactor = qb.overall_rating / 75;
    const combinedFactor = (teamRatingFactor + qbRatingFactor) / 2;
    passYardsGenerated   = clamp(randomNormal(250 * combinedFactor, 50), 60, 430);
    const passAttempts   = clamp(randomNormal(34, 5), 20, 50);
    const compPct        = Math.min(0.75, Math.max(0.42, 0.42 + (qb.overall_rating - 50) * 0.0033 + randomNormal(0, 0.04)));
    const completions    = clamp(passAttempts * compPct, 10, passAttempts);
    // INTs: reduced slightly — ~0.6/game for 75 OVR, ~0.3 for elite
    const intMean        = Math.max(0.1, 0.85 - (qb.overall_rating - 60) * 0.02);
    const ints           = clamp(randomNormal(intMean, 0.65), 0, 4);
    const qbCarries      = Math.random() > 0.6 ? clamp(randomNormal(4, 2), 0, 8) : 0;

    stats.push({
      player_id: qb.id, team_id: teamId,
      pass_attempts: passAttempts, completions, pass_yards: passYardsGenerated,
      pass_tds: passTDs, interceptions: ints,
      rush_attempts: qbCarries, rush_yards: clamp(randomNormal(qbCarries * 5, 8), 0, 50), rush_tds: 0,
      targets: 0, receptions: 0, rec_yards: 0, rec_tds: 0,
      ...defStatDefaults,
    });
  }

  // RBs
  const totalRushAttempts = clamp(randomNormal(26, 5), 14, 40);
  const rbRatingWeights   = rbs.map(rb => rb.overall_rating / 75);
  const rbWeightTotal     = rbRatingWeights.reduce((a, b) => a + b, 0) || 1;

  rbs.forEach((rb, i) => {
    const baseShare = rbRatingWeights[i] / rbWeightTotal;
    const share     = clamp(randomNormal(baseShare * 100, 8), 20, 80) / 100;
    const carries   = clamp(totalRushAttempts * share, i === 0 ? 6 : 0, 32);
    const ypc       = Math.max(2.8, randomNormal(4.2 + (rb.overall_rating - 70) * 0.05, 0.8));
    const rushYards = clamp(carries * ypc, 0, 220);
    const rbRushTDs = i === 0 && rushTDs > 0 ? rushTDs : 0;

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

  // WRs + TEs — power-weighted distribution so elite receivers pull away from the pack
  const receivers = [...wrs, ...tes];
  // Slot bias: WR1 gets a bigger base share; WR4/TE2 get less
  const slotBias  = [1.25, 1.00, 0.72, 0.48, 0.90, 0.58];
  const recPowerWeights = receivers.map((r, i) =>
    Math.pow(r.overall_rating / 75, 2.2) * (slotBias[i] ?? 0.45)
  );
  const recPowerTotal = recPowerWeights.reduce((a, b) => a + b, 0) || 1;
  let remainingRecTDs = passTDs;

  receivers.forEach((rec, i) => {
    const powerShare   = recPowerWeights[i] / recPowerTotal;
    // Higher stdDev (35) creates boom/bust games; cap raised to 250 for big games
    const recYards     = clamp(randomNormal(passYardsGenerated * powerShare, 35), 0, 250);
    const ratingFactor = rec.overall_rating / 75;
    const targets      = clamp(randomNormal((9 * ratingFactor) - i * 0.8, 2), 1, 14);
    const catchRate    = Math.min(0.82, Math.max(0.48, 0.55 + (rec.overall_rating - 70) * 0.004));
    const recs         = clamp(targets * randomNormal(catchRate, 0.06), 0, targets);
    const tdThreshold  = 0.6 - (rec.overall_rating - 70) * 0.005;
    const recTDs       = remainingRecTDs > 0 && Math.random() > tdThreshold ? 1 : 0;
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

function generateDefensiveStats(teamId, opponentQBInts, defenseRating) {
  const stats = [];
  const defFactor = defenseRating / 75;

  const dls = getHealthyByGroup(teamId, 'DL', 4);
  const lbs = getHealthyByGroup(teamId, 'LB', 4);
  const cbs = getHealthyByGroup(teamId, 'CB', 3);
  const ss  = getHealthyByGroup(teamId, 'S',  2);
  const dbs = [...cbs, ...ss];
  const allDef = [...dls, ...lbs, ...cbs, ...ss];

  if (allDef.length === 0) return [];

  // Reduced tackle total: 32 mean (was 44) keeps season leaders ~130-160 combined
  const totalTackles = clamp(randomNormal(32, 5), 20, 48);
  // Sacks bumped to 3.0 mean (was 2.5)
  const totalSacks   = clampFloat(randomNormal(3.0 * defFactor, 1.2), 0, 8);
  const totalPDs     = clamp(randomNormal(6 * defFactor, 2), 1, 14);
  const totalINTs    = opponentQBInts;

  const pTackles = {};
  const pAssists = {};
  const pSacks   = {};
  const pTFL     = {};
  const pPDs     = {};
  const pINTs    = {};
  const pFFs     = {};
  const pFRs     = {};
  const pDTDs    = {};

  allDef.forEach(p => {
    pTackles[p.id] = 0; pAssists[p.id] = 0; pSacks[p.id] = 0;
    pTFL[p.id] = 0; pPDs[p.id] = 0; pINTs[p.id] = 0;
    pFFs[p.id] = 0; pFRs[p.id] = 0; pDTDs[p.id] = 0;
  });

  // Distribute tackles — LB max 8/game (was 12) prevents 200+ tackle seasons
  const tackleGroups = [
    { players: lbs, share: 0.38, max: 8 },
    { players: dls, share: 0.25, max: 6 },
    { players: cbs, share: 0.22, max: 5 },
    { players: ss,  share: 0.15, max: 5 },
  ];
  for (const { players, share, max } of tackleGroups) {
    if (!players.length) continue;
    const groupTotal = Math.round(totalTackles * share);
    const weights    = players.map(p => p.overall_rating / 75);
    const wTotal     = weights.reduce((a, b) => a + b, 0) || 1;
    players.forEach((p, i) => {
      pTackles[p.id] = clamp(randomNormal((groupTotal * weights[i] / wTotal), 2), 0, max);
      pAssists[p.id] = clamp(randomNormal(pTackles[p.id] * 0.35, 1), 0, 4);
    });
  }

  // Sacks — sorted by OVR so better rushers get more, allow multi-sack games
  const passRushers = [...dls, ...lbs].sort((a, b) => b.overall_rating - a.overall_rating);
  let remSacks = totalSacks;
  passRushers.forEach(p => {
    if (remSacks <= 0) return;
    const ovrBonus = Math.max(0, (p.overall_rating - 70) * 0.008);
    if (Math.random() < 0.32 + ovrBonus) {
      const s = Math.min(remSacks, Math.random() < 0.12 ? 2 : Math.random() < 0.72 ? 1 : 0.5);
      pSacks[p.id] = s;
      pTFL[p.id]   = s + (Math.random() < 0.35 ? 1 : 0);
      remSacks -= s;
    }
  });

  // INTs — shuffle DBs randomly each game so no single CB hogs all picks
  const shuffledDBs = [...dbs].sort(() => Math.random() - 0.5);
  let remINTs = totalINTs;
  for (const p of shuffledDBs) {
    if (remINTs <= 0) break;
    if (Math.random() < 0.32) {
      pINTs[p.id] = 1;
      if (Math.random() < 0.12) pDTDs[p.id] = 1;
      remINTs--;
    }
  }

  // Pass deflections to DBs
  let remPDs = totalPDs;
  dbs.forEach(p => {
    if (remPDs <= 0) return;
    const pd = clamp(randomNormal(remPDs / dbs.length, 1.0), 0, 4);
    pPDs[p.id] = pd;
    remPDs -= pd;
  });

  // Forced fumble / recovery
  if (Math.random() < 0.30 && allDef.length > 0) {
    pFFs[allDef[Math.floor(Math.random() * allDef.length)].id] = 1;
  }
  if (Math.random() < 0.20 && allDef.length > 0) {
    const rec = allDef[Math.floor(Math.random() * allDef.length)];
    pFRs[rec.id] = 1;
    if (Math.random() < 0.12) pDTDs[rec.id] = 1;
  }

  // Build stat rows
  for (const p of allDef) {
    const tackles = pTackles[p.id] || 0;
    const sacks   = pSacks[p.id] || 0;
    const ints    = pINTs[p.id] || 0;
    const pds     = pPDs[p.id] || 0;
    const ffs     = pFFs[p.id] || 0;
    if (tackles === 0 && sacks === 0 && ints === 0 && pds === 0 && ffs === 0) continue;

    stats.push({
      player_id: p.id, team_id: teamId,
      pass_attempts: 0, completions: 0, pass_yards: 0, pass_tds: 0, interceptions: 0,
      rush_attempts: 0, rush_yards: 0, rush_tds: 0,
      targets: 0, receptions: 0, rec_yards: 0, rec_tds: 0,
      tackles,
      assisted_tackles: pAssists[p.id] || 0,
      sacks,
      tfl:               pTFL[p.id] || 0,
      forced_fumbles:    ffs,
      fumble_recoveries: pFRs[p.id] || 0,
      def_interceptions: ints,
      pass_deflections:  pds,
      def_tds:           pDTDs[p.id] || 0,
    });
  }

  return stats;
}

function simulateGame(homeTeamId, awayTeamId) {
  const homeRatings = getTeamRatings(homeTeamId);
  const awayRatings = getTeamRatings(awayTeamId);

  const leagueAvg          = 23;
  const homefieldAdvantage = 2.5;

  let homeScore = Math.round(randomNormal(
    (homeRatings.offenseRating / awayRatings.defenseRating) * leagueAvg + homefieldAdvantage, 7
  ));
  let awayScore = Math.round(randomNormal(
    (awayRatings.offenseRating / homeRatings.defenseRating) * leagueAvg, 7
  ));

  homeScore = Math.max(0, homeScore);
  awayScore = Math.max(0, awayScore);

  const homeOffStats = generatePlayerStats(homeTeamId, homeScore, homeRatings.offenseRating);
  const awayOffStats = generatePlayerStats(awayTeamId, awayScore, awayRatings.offenseRating);

  const homeQBInts = homeOffStats.find(s => s.pass_attempts > 0)?.interceptions ?? 0;
  const awayQBInts = awayOffStats.find(s => s.pass_attempts > 0)?.interceptions ?? 0;

  const homeDefStats = generateDefensiveStats(homeTeamId, awayQBInts, homeRatings.defenseRating);
  const awayDefStats = generateDefensiveStats(awayTeamId, homeQBInts, awayRatings.defenseRating);

  return {
    homeScore,
    awayScore,
    homePlayerStats: [...homeOffStats, ...homeDefStats],
    awayPlayerStats: [...awayOffStats, ...awayDefStats],
  };
}

module.exports = { simulateGame };