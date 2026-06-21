const { db } = require('../database');
import type { TeamData, TeamRatings, PlayerRow, CoachRow, SchemeRow } from './types';

// ─── Math Helpers ─────────────────────────────────────────────────────────────

export function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.random(), u2 = Math.random();
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stdDev;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val)));
}

export function clampFloat(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(val * 2) / 2));
}

export function attr(p: PlayerRow, col: keyof Omit<PlayerRow, 'id' | 'position' | 'depth_slot'>, fallback = 70): number {
  return (p[col] as number | null) ?? fallback;
}

// ─── Team Data Loader — 3 queries per team replaces ~15–25 per-game queries ───

export function loadTeamData(teamId: number): TeamData {
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

// ─── In-Memory Position Filter ────────────────────────────────────────────────

export function byPos(players: PlayerRow[], position: string, limit: number): PlayerRow[] {
  return players
    .filter(p => p.position === position)
    .sort((a, b) => a.depth_slot - b.depth_slot || b.overall_rating - a.overall_rating)
    .slice(0, limit);
}

// ─── Team Ratings (fully in-memory, zero additional DB calls) ─────────────────

export function computeTeamRatings(data: TeamData): TeamRatings {
  const { players, coaches, scheme } = data;

  const effOvr = (p: PlayerRow) => p.overall_rating * (1 + (p.morale - 75) * 0.001);

  // ── Position buckets ──────────────────────────────────────────────────────
  const qbs  = players.filter(p => p.position === 'QB');
  const rbs  = players.filter(p => p.position === 'RB');
  const wrs  = players.filter(p => p.position === 'WR');
  const tes  = players.filter(p => p.position === 'TE');
  const ols  = players.filter(p => p.position === 'OL');
  const dls  = players.filter(p => p.position === 'DL');
  const lbs  = players.filter(p => p.position === 'LB');
  const cbs  = players.filter(p => p.position === 'CB');
  const ss   = players.filter(p => p.position === 'S');

  const avg = (arr: PlayerRow[], limit?: number) => {
    const pool = limit ? [...arr].sort((a, b) => effOvr(b) - effOvr(a)).slice(0, limit) : arr;
    return pool.length ? pool.reduce((s, p) => s + effOvr(p), 0) / pool.length : 70;
  };

  // ── Weighted offense rating ───────────────────────────────────────────────
  // QB(28%) · OL(20%) · WR(18%) · RB(14%) · TE(10%) · fallback blend(10%)
  const offParts = [
    { val: avg(qbs, 1),  w: 0.28 },
    { val: avg(ols, 5),  w: 0.20 },
    { val: avg(wrs, 3),  w: 0.18 },
    { val: avg(rbs, 2),  w: 0.14 },
    { val: avg(tes, 2),  w: 0.10 },
  ];
  const offWeightUsed = offParts.reduce((s, p) => s + (p.val > 0 ? p.w : 0), 0) || 1;
  let offenseRating = offParts.reduce((s, p) => s + p.val * p.w, 0) / offWeightUsed;

  // ── Weighted defense rating ───────────────────────────────────────────────
  // DL(28%) · LB(24%) · CB(20%) · S(18%) · fallback blend(10%)
  const defParts = [
    { val: avg(dls, 4),  w: 0.28 },
    { val: avg(lbs, 4),  w: 0.24 },
    { val: avg(cbs, 3),  w: 0.20 },
    { val: avg(ss,  2),  w: 0.18 },
  ];
  const defWeightUsed = defParts.reduce((s, p) => s + (p.val > 0 ? p.w : 0), 0) || 1;
  let defenseRating = defParts.reduce((s, p) => s + p.val * p.w, 0) / defWeightUsed;

  // ── Coaching modifiers ────────────────────────────────────────────────────
  const hc = coaches.find(c => c.role === 'HC');
  const oc = coaches.find(c => c.role === 'OC');
  const dc = coaches.find(c => c.role === 'DC');
  if (hc) { offenseRating += (hc.overall_rating - 70) * 0.05; defenseRating += (hc.overall_rating - 70) * 0.05; }
  if (oc)   offenseRating += (oc.offense_rating - 70) * 0.15;
  if (dc)   defenseRating += (dc.defense_rating - 70) * 0.15;

  // ── Scheme modifiers (unchanged) ──────────────────────────────────────────
  if (scheme) {
    const topN = (arr: PlayerRow[], n: number) =>
      [...arr].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, n);
    const avgAttr = (arr: PlayerRow[], key: keyof PlayerRow, fallback = 70): number =>
      arr.length ? arr.reduce((s, p) => s + ((p[key] as number) ?? fallback), 0) / arr.length : fallback;

    let offMod = 0, defMod = 0;

    switch (scheme.offense_scheme) {
      case 'West Coast': {
        const qbAcc = qbs[0]?.throw_accuracy ?? 70;
        const teAvg = avg(topN(tes, 2));
        offMod = ((qbAcc + teAvg) / 2 - 70) * 0.08;
        break;
      }
      case 'Air Raid':
        offMod = (avg(topN(wrs, 3)) - 70) * 0.14;
        break;
      case 'Power Run': {
        const rbAvg = avg(topN(rbs, 2));
        const olAvg = avg(topN(ols, 5));
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
        offMod = (avg([...qbs, ...rbs, ...wrs, ...tes, ...ols]) - 70) * 0.07;
        break;
    }

    switch (scheme.defense_scheme) {
      case '4-3':
        defMod = (avg(topN(dls, 4)) - 70) * 0.12;
        break;
      case '3-4':
        defMod = (avg(topN(lbs, 4)) - 70) * 0.13;
        break;
      case 'Zone Cover 2': {
        const dbAll = [...topN(cbs, 3), ...topN(ss, 2)];
        defMod = (avgAttr(dbAll, 'coverage') - 70) * 0.11;
        break;
      }
      case 'Man Press':
        defMod = (avg(topN(cbs, 2)) - 70) * 0.11;
        break;
      case 'Blitz Heavy': {
        const rushers = [...dls, ...lbs].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, 6);
        defMod = (avgAttr(rushers, 'pass_rush') - 70) * 0.15;
        break;
      }
    }

    offenseRating += offMod;
    defenseRating += defMod;
  }

  return { offenseRating, defenseRating };
}
