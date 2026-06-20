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

  const offense = players.filter(p => ['QB','RB','WR','TE','OL'].includes(p.position));
  const defense = players.filter(p => ['DL','LB','CB','S'].includes(p.position));

  let offenseRating = offense.reduce((s, p) => s + effOvr(p), 0) / (offense.length || 1);
  let defenseRating = defense.reduce((s, p) => s + effOvr(p), 0) / (defense.length || 1);

  const hc = coaches.find(c => c.role === 'HC');
  const oc = coaches.find(c => c.role === 'OC');
  const dc = coaches.find(c => c.role === 'DC');
  if (hc) { offenseRating += (hc.overall_rating - 70) * 0.05; defenseRating += (hc.overall_rating - 70) * 0.05; }
  if (oc) offenseRating += (oc.offense_rating - 70) * 0.15;
  if (dc) defenseRating += (dc.defense_rating - 70) * 0.15;

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
