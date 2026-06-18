import { db } from '../database';
import { playerRepo, contractRepo, gameRepo } from '../repositories';
import { MAX_ACTIVE_ROSTER, MAX_PRACTICE_SQUAD, MIN_CPU_ROSTER, SALARY_CAP } from '../constants';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { SuccessResult } from '../types';
import { logNewsEvent } from '../helpers/logNewsEvent';

// ─── Market Rate ────────────────────────────────────────────────────────────

const MARKET_RATE_TABLE: Record<string, [number, number][]> = {
  QB: [[99,65],[93,50],[88,35],[83,20],[78,10],[73,4],[70,1.5]],
  WR: [[99,45],[93,35],[88,25],[83,16],[78,8],[73,3],[70,1.5]],
  DL: [[99,38],[93,30],[88,22],[83,14],[78,7],[73,3],[70,1.5]],
  CB: [[99,32],[93,25],[88,18],[83,11],[78,5],[73,2.5],[70,1.5]],
  OL: [[99,36],[93,30],[88,24],[83,18],[78,9],[73,3],[70,1.5]],
  LB: [[99,26],[93,20],[88,15],[83,9],[78,4.5],[73,2],[70,1.5]],
  TE: [[99,24],[93,19],[88,14],[83,8],[78,4],[73,2],[70,1.5]],
  S:  [[99,22],[93,17],[88,12],[83,7],[78,3.5],[73,1.8],[70,1.5]],
  RB: [[99,18],[93,14],[88,10],[83,6],[78,3],[73,1.5],[70,1.2]],
  K:  [[99,8],[93,6],[88,5],[83,4],[78,3],[73,2],[70,1]],
};
const TRAIT_MUL: Record<string, number> = { Normal: 1.0, Star: 1.1, Superstar: 1.25, 'X-Factor': 1.45 };

export function calcFairMarket(ovr: number, position: string, devTrait: string): number {
  const rates = MARKET_RATE_TABLE[position] ?? MARKET_RATE_TABLE['LB'];
  let base = rates[rates.length - 1][1];
  for (let i = 0; i < rates.length - 1; i++) {
    const [highOvr, highSal] = rates[i];
    const [lowOvr, lowSal] = rates[i + 1];
    if (ovr >= lowOvr) {
      const t = (ovr - lowOvr) / (highOvr - lowOvr);
      base = lowSal + t * (highSal - lowSal);
      break;
    }
  }
  return Math.round(base * (TRAIT_MUL[devTrait] ?? 1.0) * 10) / 10;
}

// ─── User-facing Contract Operations ────────────────────────────────────────

export function signFreeAgent(
  playerId: number, teamId: number, years: number, salary: number
): SuccessResult {
  if (playerRepo.getActiveCount(teamId) >= MAX_ACTIVE_ROSTER)
    return { success: false, reason: `Active roster is full (${MAX_ACTIVE_ROSTER}/${MAX_ACTIVE_ROSTER}). Release a player first.` };

  const player = playerRepo.getById(playerId);
  if (!player) return { success: false, reason: 'Player not found.' };

  const fairMarket = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
  const ratio = salary / Math.max(fairMarket, 1);
  let acceptChance =
    ratio >= 1.00 ? 1.00 : ratio >= 0.85 ? 0.90 : ratio >= 0.70 ? 0.60 : ratio >= 0.50 ? 0.20 : 0.00;

  if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.20);
  if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.10);

  const { wins, played } = gameRepo.getWinRecord(teamId, getCurrentSeason());
  if (played >= 4 && wins / played >= 0.65) acceptChance = Math.min(1, acceptChance + 0.08);

  if (Math.random() >= acceptChance) {
    const reason =
      ratio < 0.50 ? `Insulted by the offer. ${player.dev_trait === 'X-Factor' || player.dev_trait === 'Superstar' ? 'Elite players' : 'Players'} don't sign for that salary.` :
      ratio < 0.70 ? `Not enough money. Looking for closer to ${fairMarket.toFixed(1)}M/yr on the open market.` :
      ratio < 0.85 ? `Decided to explore other options. Try sweetening the offer slightly.` :
      `Chose to sign elsewhere. Sometimes it just doesn't work out.`;
    return { success: false, reason };
  }

  const guaranteedPct = Math.round(30 + Math.random() * 30);
  playerRepo.activate(playerId, teamId);
  contractRepo.create(playerId, teamId, years, salary, Math.round(salary * years * (guaranteedPct / 100) * 10) / 10, guaranteedPct);
  return { success: true };
}

export function resignPlayer(
  playerId: number, years: number, salary: number
): SuccessResult & { willHitFA?: boolean } {
  const player = playerRepo.getById(playerId);
  if (!player) return { success: false, reason: 'Player not found.' };

  const fairMarket = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
  const ratio = salary / Math.max(fairMarket, 1);
  let acceptChance =
    ratio >= 1.00 ? 1.00 : ratio >= 0.85 ? 0.95 : ratio >= 0.70 ? 0.70 : ratio >= 0.50 ? 0.25 : 0.00;

  if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.15);
  if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.08);

  if (Math.random() >= acceptChance) {
    const reason =
      ratio < 0.50 ? `Insulted by the offer. Looking for around ${fairMarket.toFixed(1)}M/yr.` :
      ratio < 0.70 ? `Not enough to stay. Asking price is closer to ${fairMarket.toFixed(1)}M/yr.` :
      ratio < 0.85 ? `Wants to test the market. Try offering closer to ${fairMarket.toFixed(1)}M/yr.` :
      `Decided to explore other options despite the offer.`;
    return { success: false, reason, willHitFA: true };
  }

  const guaranteedPct = Math.round(35 + Math.random() * 25);
  contractRepo.update(playerId, years, salary, Math.round(salary * years * (guaranteedPct / 100) * 10) / 10, guaranteedPct);
  return { success: true };
}

export function promoteFromPS(playerId: number, teamId: number): SuccessResult {
  if (playerRepo.getActiveCount(teamId) >= MAX_ACTIVE_ROSTER)
    return { success: false, reason: `Active roster is full (${MAX_ACTIVE_ROSTER}/${MAX_ACTIVE_ROSTER}). Release a player first.` };

  const player = playerRepo.getById(playerId);
  if (!player || player.roster_status !== 'practice_squad')
    return { success: false, reason: 'Player not on practice squad.' };

  playerRepo.updateRosterStatus(playerId, 'active');

  const SAL_RANGES: Record<string, [number, number]> = {
    QB: [1.0, 42], WR: [1.0, 28], DL: [1.0, 32], LB: [1.0, 18],
    CB: [1.0, 22], TE: [1.0, 16], OL: [1.0, 22], S: [1.0, 18],
    RB: [1.0, 16], K: [1.0, 4],
  };
  const [minSal, maxSal] = SAL_RANGES[player.position] ?? [1.0, 10];
  const ovrFactor = Math.pow(Math.max(0, (player.overall_rating - 70)) / 29, 2.5);
  const salary = Math.round((minSal + ovrFactor * (maxSal - minSal)) * 10) / 10;
  const years = player.age <= 25 ? 3 : player.age <= 29 ? 2 : 1;
  contractRepo.update(playerId, years, salary, Math.round(salary * years * 0.3 * 10) / 10, 30);
  return { success: true };
}

// ─── CPU GM Helpers ──────────────────────────────────────────────────────────

const POS_MARKET_WEIGHT: Record<string, number> = {
  QB: 1.5, CB: 1.2, DL: 1.2, WR: 1.15, LB: 1.1, TE: 1.1, OL: 1.05, S: 1.0, RB: 0.9, K: 0.6,
};

const POSITION_THRESHOLDS: Record<string, { min: number; ideal: number }> = {
  QB: { min: 2, ideal: 3 }, RB: { min: 3, ideal: 4 }, WR: { min: 4, ideal: 5 },
  TE: { min: 2, ideal: 3 }, OL: { min: 6, ideal: 8 }, DL: { min: 4, ideal: 6 },
  LB: { min: 3, ideal: 5 }, CB: { min: 3, ideal: 5 }, S: { min: 2, ideal: 3 }, K: { min: 1, ideal: 1 },
};

const TEAM_BID_CONFIG: Record<string, { base: number; spread: number; minOvr: number }> = {
  Contender: { base: 1.12, spread: 0.16, minOvr: 76 },
  Buyer:     { base: 1.00, spread: 0.14, minOvr: 72 },
  Neutral:   { base: 0.88, spread: 0.12, minOvr: 68 },
  Seller:    { base: 0.78, spread: 0.10, minOvr: 62 },
  Rebuilding:{ base: 0.70, spread: 0.10, minOvr: 58 },
};

const RESIGN_PREMIUM: Record<string, number> = {
  Contender: 1.10, Buyer: 1.02, Neutral: 0.95, Seller: 0.87, Rebuilding: 0.78,
};

function getCpuTeamType(teamId: number): string {
  const season = getCurrentSeason();
  const record = gameRepo.getTeamRecord(teamId, season);
  const played = (record.wins ?? 0) + (record.losses ?? 0);
  const winPct = played >= 4 ? record.wins / played : 0.5;

  const row = db.prepare(`
    SELECT AVG(overall_rating) as avgOvr, AVG(age) as avgAge
    FROM players WHERE team_id = ? AND roster_status = 'active'
  `).get(teamId) as any;

  const avgOvr = row?.avgOvr ?? 75;
  const avgAge = row?.avgAge ?? 26;

  if (winPct >= 0.55 && avgOvr >= 77) return 'Contender';
  if (winPct >= 0.45 || avgOvr >= 76) return 'Buyer';
  if (winPct < 0.35 && avgAge >= 27.5) return 'Seller';
  if (winPct < 0.35 || avgOvr < 73) return 'Rebuilding';
  return 'Neutral';
}

/**
 * Classifies all given teams in 2 queries instead of 2 queries × N teams.
 */
function batchGetTeamTypes(teamIds: number[], season: number): Map<number, string> {
  if (teamIds.length === 0) return new Map();
  const ph = teamIds.map(() => '?').join(',');

  const recordRows = db.prepare(`
    SELECT t.id as team_id,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
                 OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) as wins,
      COUNT(g.id) as played
    FROM teams t
    LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
      AND g.season = ? AND g.is_simulated = 1
    WHERE t.id IN (${ph})
    GROUP BY t.id
  `).all(season, ...teamIds) as any[];

  const rosterRows = db.prepare(`
    SELECT team_id, AVG(overall_rating) as avgOvr, AVG(age) as avgAge
    FROM players
    WHERE team_id IN (${ph}) AND roster_status = 'active'
    GROUP BY team_id
  `).all(...teamIds) as any[];

  const rosterMap = new Map(rosterRows.map((r: any) => [r.team_id, r]));

  const result = new Map<number, string>();
  for (const rec of recordRows) {
    const winPct = rec.played >= 4 ? rec.wins / rec.played : 0.5;
    const roster = rosterMap.get(rec.team_id) ?? {};
    const avgOvr = roster.avgOvr ?? 75;
    const avgAge = roster.avgAge ?? 26;

    if (winPct >= 0.55 && avgOvr >= 77) result.set(rec.team_id, 'Contender');
    else if (winPct >= 0.45 || avgOvr >= 76) result.set(rec.team_id, 'Buyer');
    else if (winPct < 0.35 && avgAge >= 27.5) result.set(rec.team_id, 'Seller');
    else if (winPct < 0.35 || avgOvr < 73) result.set(rec.team_id, 'Rebuilding');
    else result.set(rec.team_id, 'Neutral');
  }
  return result;
}

function getTeamName(teamId: number): string {
  const t = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(teamId) as any;
  return t ? `${t.city} ${t.name}` : 'Unknown Team';
}

// ─── Phase 1A: Cap Cleanup ───────────────────────────────────────────────────

export function cpuRosterCuts(userTeamId: number): { totalReleased: number; teamsAffected: number } {
  const season = getCurrentSeason();
  const cpuTeams = db.prepare('SELECT id FROM teams WHERE id != ?').all(userTeamId) as any[];
  const teamIds = cpuTeams.map((t: any) => t.id);

  const ph = teamIds.map(() => '?').join(',');
  const capRows = db.prepare(`
    SELECT c.team_id, COALESCE(SUM(c.annual_salary), 0) as used_cap
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id IN (${ph}) AND p.roster_status = 'active'
    GROUP BY c.team_id
  `).all(...teamIds) as any[];
  const capMap = new Map(capRows.map((r: any) => [r.team_id, Math.round(r.used_cap * 10) / 10]));

  let totalReleased = 0;
  const teamsAffected = new Set<number>();

  for (const team of cpuTeams) {
    const capUsed = capMap.get(team.id) ?? 0;
    if (capUsed <= SALARY_CAP) continue;

    const players = db.prepare(`
      SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.age, p.dev_trait,
        c.annual_salary
      FROM players p
      JOIN contracts c ON c.player_id = p.id
      WHERE p.team_id = ? AND p.roster_status = 'active'
      ORDER BY (CAST(p.overall_rating AS REAL) / MAX(c.annual_salary, 0.5)) ASC
    `).all(team.id) as any[];

    let currentCap = capUsed;
    for (const player of players) {
      if (currentCap <= SALARY_CAP) break;
      if (player.dev_trait === 'X-Factor') continue;
      if (player.overall_rating >= 88) continue;

      contractRepo.delete(player.id);
      playerRepo.releaseToFA(player.id);
      currentCap -= player.annual_salary;
      totalReleased++;
      teamsAffected.add(team.id);

      if (player.overall_rating >= 76) {
        logNewsEvent({
          eventType: 'release',
          category: 'transactions',
          headline: `${getTeamName(team.id)} release ${player.first_name} ${player.last_name}`,
          detail: `${player.position} | OVR ${player.overall_rating} | Cap savings: $${player.annual_salary}M`,
          teamId: team.id,
          playerId: player.id,
          season,
        });
      }
    }
  }

  return { totalReleased, teamsAffected: teamsAffected.size };
}

// ─── Phase 1B: CPU Resign Attempts ──────────────────────────────────────────

export function cpuResignAttempts(userTeamId: number): { attempted: number; resigned: number; hitFA: number } {
  const season = getCurrentSeason();
  const cpuTeams = db.prepare('SELECT id FROM teams WHERE id != ?').all(userTeamId) as any[];
  const teamIds = cpuTeams.map((t: any) => t.id);
  if (teamIds.length === 0) return { attempted: 0, resigned: 0, hitFA: 0 };

  const ph = teamIds.map(() => '?').join(',');

  // Batch: team types, cap usage, and all expiring players in 4 queries total
  const teamTypes = batchGetTeamTypes(teamIds, season);

  const capRows = db.prepare(`
    SELECT c.team_id, COALESCE(SUM(c.annual_salary), 0) as used_cap
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id IN (${ph}) AND p.roster_status = 'active'
    GROUP BY c.team_id
  `).all(...teamIds) as any[];
  const capMap = new Map(capRows.map((r: any) => [r.team_id, Math.round(r.used_cap * 10) / 10]));

  const allExpiring = db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.overall_rating, p.age, p.dev_trait,
      c.team_id
    FROM contracts c
    JOIN players p ON p.id = c.player_id
    WHERE c.team_id IN (${ph}) AND c.years_remaining = 1 AND p.roster_status = 'active'
    ORDER BY c.team_id, p.overall_rating DESC
  `).all(...teamIds) as any[];

  const expiringByTeam = new Map<number, any[]>();
  for (const row of allExpiring) {
    if (!expiringByTeam.has(row.team_id)) expiringByTeam.set(row.team_id, []);
    expiringByTeam.get(row.team_id)!.push(row);
  }

  let attempted = 0, resigned = 0, hitFA = 0;

  for (const team of cpuTeams) {
    const teamType = teamTypes.get(team.id) ?? 'Neutral';
    const premium = RESIGN_PREMIUM[teamType] ?? 0.95;
    let capLeft = SALARY_CAP - (capMap.get(team.id) ?? 0);

    const expiring = expiringByTeam.get(team.id) ?? [];

    for (const player of expiring) {
      if (player.overall_rating < 68) continue;

      const fair = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
      const offer = Math.round(fair * premium * 10) / 10;
      if (capLeft < offer) continue;

      attempted++;

      const ratio = offer / fair;
      let acceptChance =
        ratio >= 1.00 ? 0.93 : ratio >= 0.88 ? 0.78 : ratio >= 0.75 ? 0.52 : 0.22;
      if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
      if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.12);
      if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.22);
      if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.12);
      if (player.dev_trait === 'Star') acceptChance = Math.max(0, acceptChance - 0.06);

      const years = player.age <= 27 ? 3 : player.age <= 30 ? 2 : 1;
      const guaranteedPct = Math.round(28 + Math.random() * 22);
      const isNotable = player.overall_rating >= 78 || player.dev_trait === 'Superstar' || player.dev_trait === 'X-Factor';

      if (Math.random() < acceptChance) {
        contractRepo.update(
          player.id, years, offer,
          Math.round(offer * years * (guaranteedPct / 100) * 10) / 10,
          guaranteedPct
        );
        capLeft -= offer;
        resigned++;

        if (isNotable) {
          logNewsEvent({
            eventType: 'resign',
            category: 'transactions',
            headline: `${getTeamName(team.id)} re-sign ${player.first_name} ${player.last_name}`,
            detail: `${player.position} | OVR ${player.overall_rating} [${player.dev_trait}] | ${years}-yr, $${offer}M/yr`,
            teamId: team.id,
            playerId: player.id,
            season,
          });
        }
      } else {
        hitFA++;

        if (isNotable) {
          logNewsEvent({
            eventType: 'fa-departure',
            category: 'transactions',
            headline: `${player.first_name} ${player.last_name} set to hit free agency`,
            detail: `${player.position} | OVR ${player.overall_rating} [${player.dev_trait}] | Declined offer from ${getTeamName(team.id)}`,
            teamId: team.id,
            playerId: player.id,
            season,
          });
        }
      }
    }
  }

  return { attempted, resigned, hitFA };
}

// ─── Phase 1C: FA Bidding Engine ─────────────────────────────────────────────

interface TeamState {
  id: number;
  type: string;
  capLeft: number;
  spotsLeft: number;
  posCounts: Record<string, number>;
}

export function cpuFABiddingEngine(userTeamId: number): { totalSigned: number; teamsActive: number } {
  const season = getCurrentSeason();
  const cpuTeams = db.prepare('SELECT id FROM teams WHERE id != ?').all(userTeamId) as any[];
  const teamIds = cpuTeams.map((t: any) => t.id);
  if (teamIds.length === 0) return { totalSigned: 0, teamsActive: 0 };

  const ph = teamIds.map(() => '?').join(',');

  // Batch all per-team setup queries into 4 total
  const teamTypes = batchGetTeamTypes(teamIds, season);

  const capRows = db.prepare(`
    SELECT c.team_id, COALESCE(SUM(c.annual_salary), 0) as used_cap
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id IN (${ph}) AND p.roster_status = 'active'
    GROUP BY c.team_id
  `).all(...teamIds) as any[];
  const capMap = new Map(capRows.map((r: any) => [r.team_id, Math.round(r.used_cap * 10) / 10]));

  const activeRows = db.prepare(`
    SELECT team_id, COUNT(*) as cnt
    FROM players
    WHERE team_id IN (${ph}) AND roster_status = 'active'
    GROUP BY team_id
  `).all(...teamIds) as any[];
  const activeMap = new Map(activeRows.map((r: any) => [r.team_id, r.cnt as number]));

  const posRows = db.prepare(`
    SELECT team_id, position, COUNT(*) as cnt
    FROM players
    WHERE team_id IN (${ph}) AND roster_status = 'active'
    GROUP BY team_id, position
  `).all(...teamIds) as any[];
  const posMap = new Map<number, Record<string, number>>();
  for (const row of posRows) {
    if (!posMap.has(row.team_id)) posMap.set(row.team_id, {});
    posMap.get(row.team_id)![row.position] = row.cnt;
  }

  const teamStates = new Map<number, TeamState>();
  for (const team of cpuTeams) {
    teamStates.set(team.id, {
      id: team.id,
      type: teamTypes.get(team.id) ?? 'Neutral',
      capLeft: SALARY_CAP - (capMap.get(team.id) ?? 0),
      spotsLeft: MAX_ACTIVE_ROSTER - (activeMap.get(team.id) ?? 0),
      posCounts: posMap.get(team.id) ?? {},
    });
  }

  const freeAgents = db.prepare(`
    SELECT id, first_name, last_name, position, overall_rating, age, dev_trait
    FROM players
    WHERE is_free_agent = 1 AND roster_status = 'free_agent'
    ORDER BY (overall_rating * 1.0) DESC, age ASC
  `).all() as any[];

  let totalSigned = 0;
  const signingsByTeam = new Set<number>();

  // ── Competitive bidding pass ──────────────────────────────────────────────
  for (const fa of freeAgents) {
    const fair = calcFairMarket(fa.overall_rating, fa.position, fa.dev_trait);
    const threshold = POSITION_THRESHOLDS[fa.position];
    if (!threshold) continue;

    const bidders: { teamId: number; bid: number }[] = [];

    for (const [, state] of teamStates) {
      if (state.spotsLeft <= 0) continue;

      const posCount = state.posCounts[fa.position] ?? 0;
      const isCritical = posCount < threshold.min;
      const isDepth = posCount < threshold.ideal;

      if (!isCritical && !isDepth) continue;

      const config = TEAM_BID_CONFIG[state.type] ?? TEAM_BID_CONFIG.Neutral;
      if (fa.overall_rating < config.minOvr && !isCritical) continue;

      const needMult = isCritical ? 1.14 : 1.05;
      const typeMult = config.base + Math.random() * config.spread;
      const bid = Math.round(fair * typeMult * needMult * 10) / 10;

      if (state.capLeft < bid) continue;

      bidders.push({ teamId: state.id, bid });
    }

    if (bidders.length === 0) continue;

    bidders.sort((a, b) => b.bid - a.bid);

    for (const { teamId, bid } of bidders) {
      const ratio = bid / fair;
      let acceptChance =
        ratio >= 1.15 ? 0.96 : ratio >= 1.00 ? 0.86 : ratio >= 0.85 ? 0.65 : ratio >= 0.70 ? 0.35 : 0.12;
      if (fa.age >= 33) acceptChance = Math.min(1, acceptChance + 0.12);
      if (fa.age >= 36) acceptChance = Math.min(1, acceptChance + 0.12);
      if (fa.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.22);
      if (fa.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.12);

      if (Math.random() >= acceptChance) continue;

      const years = fa.age <= 26 ? 3 : fa.age <= 30 ? 2 : 1;
      const guaranteedPct = Math.round(25 + Math.random() * 25);

      db.transaction(() => {
        playerRepo.activate(fa.id, teamId);
        contractRepo.create(
          fa.id, teamId, years, bid,
          Math.round(bid * years * (guaranteedPct / 100) * 10) / 10,
          guaranteedPct
        );
      })();

      const state = teamStates.get(teamId)!;
      state.capLeft -= bid;
      state.spotsLeft -= 1;
      state.posCounts[fa.position] = (state.posCounts[fa.position] ?? 0) + 1;

      if (fa.overall_rating >= 76 || fa.dev_trait === 'Superstar' || fa.dev_trait === 'X-Factor') {
        logNewsEvent({
          eventType: 'signing',
          category: 'transactions',
          headline: `${getTeamName(teamId)} sign ${fa.first_name} ${fa.last_name}`,
          detail: `${fa.position} | OVR ${fa.overall_rating} [${fa.dev_trait}] | ${years}-yr, $${bid}M/yr`,
          teamId,
          playerId: fa.id,
          season,
        });
      }

      totalSigned++;
      signingsByTeam.add(teamId);
      break;
    }
  }

  // ── Minimum roster fill pass ──────────────────────────────────────────────
  for (const [, state] of teamStates) {
    if (state.spotsLeft <= 0) continue;

    for (const [pos, minCount] of Object.entries(MIN_CPU_ROSTER as Record<string, number>)) {
      const deficit = minCount - (state.posCounts[pos] ?? 0);
      for (let i = 0; i < deficit && state.spotsLeft > 0; i++) {
        const fa = playerRepo.getFreeAgents(pos, 1)[0];
        if (!fa) break;

        const fair = calcFairMarket(fa.overall_rating, fa.position, fa.dev_trait);
        const salary = Math.round(fair * (0.82 + Math.random() * 0.13) * 10) / 10;
        if (state.capLeft < salary) continue;

        const years = fa.age <= 27 ? 2 : 1;
        playerRepo.activate(fa.id, state.id);
        contractRepo.create(fa.id, state.id, years, salary, Math.round(salary * years * 0.25 * 10) / 10, 25);

        state.capLeft -= salary;
        state.spotsLeft -= 1;
        state.posCounts[pos] = (state.posCounts[pos] ?? 0) + 1;
        totalSigned++;
        signingsByTeam.add(state.id);
      }
    }
  }

  return { totalSigned, teamsActive: signingsByTeam.size };
}

/** Backward-compatible alias — contractHandlers.ts calls this via IPC. */
export function cpuFASigning(userTeamId: number): { totalSigned: number; teamsActive: number } {
  return cpuFABiddingEngine(userTeamId);
}

// ─── User-facing Roster Operations ──────────────────────────────────────────

export function signFreeAgentToPS(playerId: number, teamId: number): SuccessResult {
  if (playerRepo.getPSCount(teamId) >= MAX_PRACTICE_SQUAD)
    return { success: false, reason: `Practice squad is full (${MAX_PRACTICE_SQUAD}/${MAX_PRACTICE_SQUAD}).` };
  const player = playerRepo.getById(playerId);
  if (!player || player.team_id !== null) return { success: false, reason: 'Player not available.' };
  playerRepo.assignToPS(playerId, teamId);
  contractRepo.createPS(playerId, teamId);
  return { success: true };
}

export function extendPlayer(playerId: number, years: number, salary: number): SuccessResult {
  const contract = contractRepo.getByPlayer(playerId);
  if (!contract) return { success: false, reason: 'No contract found.' };
  const guaranteedPct = Math.round(40 + Math.random() * 20);
  contractRepo.update(playerId, years, salary, Math.round(salary * years * (guaranteedPct / 100) * 10) / 10, guaranteedPct);
  return { success: true };
}

export function restructurePlayer(playerId: number, pct: number): SuccessResult & { savings?: number; newSalary?: number } {
  const contract = contractRepo.getByPlayer(playerId);
  if (!contract) return { success: false, reason: 'No contract found.' };
  if (contract.years_remaining < 2) return { success: false, reason: 'Need 2+ years remaining to restructure.' };
  const convertedAmount = contract.annual_salary * pct;
  const savings = Math.round(convertedAmount * (1 - 1 / contract.years_remaining) * 10) / 10;
  const newSalary = Math.round((contract.annual_salary - savings) * 10) / 10;
  const newGuaranteed = Math.round(((contract.guaranteed_amount ?? 0) + convertedAmount) * 10) / 10;
  contractRepo.updateSalary(
    playerId, newSalary, newGuaranteed,
    Math.min(100, Math.round((newGuaranteed / (newSalary * contract.years_remaining)) * 100))
  );
  return { success: true, savings, newSalary };
}

export function releasePlayer(playerId: number): SuccessResult & { onWaivers: boolean } {
  const season = getCurrentSeason();
  const isInSeason = gameRepo.countBySeason(season) > 0;
  const player = playerRepo.getById(playerId) as any;
  const teamId = player?.team_id ?? null;

  if (isInSeason) {
    playerRepo.releaseToWaivers(playerId, teamId, gameRepo.getCurrentWeek(season) ?? 1);
  } else {
    contractRepo.delete(playerId);
    playerRepo.releaseToFA(playerId);
  }

  if (player) {
    const t = teamId ? db.prepare('SELECT city, name FROM teams WHERE id = ?').get(teamId) as any : null;
    logNewsEvent({
      eventType: 'release', category: 'transactions',
      headline: `${t ? `${t.city} ${t.name}` : 'Team'} Release ${player.first_name} ${player.last_name}`,
      detail: `${player.position} · ${isInSeason ? 'Placed on waivers.' : 'Released to free agency.'}`,
      teamId, playerId,
    });
  }
  return { success: true, onWaivers: isInSeason };
}

export function getOffseasonStatus(teamId: number | null): {
  playoffsComplete: boolean; pendingResigns: number;
  draftGenerated: boolean; draftComplete: boolean;
} {
  const season = getCurrentSeason();
  const champion = db.prepare('SELECT team_id FROM champions WHERE season = ?').get(season);
  const draftGenerated = champion
    ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ?').get(season) as any).count > 0
    : false;
  const draftComplete = draftGenerated
    ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ? AND is_drafted = 0').get(season) as any).count === 0
    : false;
  return {
    playoffsComplete: !!champion,
    pendingResigns: teamId ? contractRepo.countExpiring(teamId) : 0,
    draftGenerated,
    draftComplete,
  };
}
