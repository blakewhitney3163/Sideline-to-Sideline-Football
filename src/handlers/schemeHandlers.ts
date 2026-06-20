import { ipcMain } from 'electron';
import { db } from '../database';
import type { IpcEvent, RatingRow, CoverageRow, PassRushRow, QbStatsRow, SchemeDbRow, TeamIdRow } from '../types/ipc';

// ─── Scheme Definitions ───────────────────────────────────────────────────────

export const OFFENSE_SCHEMES = [
  { id: 'West Coast',  name: 'West Coast',  tagline: 'Short passes, quick rhythm',     keyPositions: 'QB (Accuracy) · TE',          description: 'Favors an accurate QB and a receiving TE. High completion rates and sustained drives.' },
  { id: 'Air Raid',   name: 'Air Raid',    tagline: 'Throw it everywhere',             keyPositions: 'WR (Top 3)',                   description: 'Pass-heavy, spread formations. Elite WR corps unlock the full potential of this system.' },
  { id: 'Power Run',  name: 'Power Run',   tagline: 'Pound the rock',                  keyPositions: 'RB · OL',                      description: 'Run-first identity built around a workhorse RB and a dominant offensive line.' },
  { id: 'Spread',     name: 'Spread',      tagline: 'Space and mobility',              keyPositions: 'QB (Speed + Accuracy)',        description: 'Mobile QB who stresses defenses with both legs and arm. Speed is everything.' },
  { id: 'Run & Gun',  name: 'Run & Gun',   tagline: 'Up-tempo, balanced attack',       keyPositions: 'All Offensive Positions',      description: 'Fast-paced, balanced run/pass. Rewards deep and well-rounded rosters.' },
];

export const DEFENSE_SCHEMES = [
  { id: '4-3',           name: '4-3',           tagline: 'Four down linemen',            keyPositions: 'DL (Top 4)',          description: 'Base four-man front. Strong vs. the run with consistent pressure from the line.' },
  { id: '3-4',           name: '3-4',           tagline: 'Linebacker-heavy',             keyPositions: 'LB (Top 4)',          description: 'Three linemen, four linebackers. Elite LBs generate both coverage and pass rush.' },
  { id: 'Zone Cover 2',  name: 'Zone Cover 2',  tagline: 'Two-deep zone coverage',       keyPositions: 'CB · S (Coverage)',   description: 'Limits big plays with a two-deep safety shell. Best when DBs have elite coverage.' },
  { id: 'Man Press',     name: 'Man Press',     tagline: 'Press and jam at the line',    keyPositions: 'CB (Top 2)',          description: 'Physical corners that shut down receivers man-to-man. High ceiling with elite CBs.' },
  { id: 'Blitz Heavy',   name: 'Blitz Heavy',   tagline: 'Extra rushers, maximum pressure', keyPositions: 'DL + LB (Pass Rush)', description: 'Sends extra pass rushers every down. Elite pass rush dominates; weak one leaves gaps.' },
];

// ─── Fit Computation ──────────────────────────────────────────────────────────

function computeOffenseFit(teamId: number, schemeId: string): number {
  try {
    switch (schemeId) {
      case 'West Coast': {
        const qb = db.prepare("SELECT throw_accuracy FROM players WHERE team_id = ? AND position = 'QB' AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 1").get(teamId) as QbStatsRow | undefined;
        const tes = db.prepare("SELECT overall_rating FROM players WHERE team_id = ? AND position = 'TE' AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 2").all(teamId) as RatingRow[];
        const qbAcc = qb?.throw_accuracy ?? 70;
        const teAvg = tes.length ? tes.reduce((s, t) => s + t.overall_rating, 0) / tes.length : 70;
        return Math.round(((qbAcc + teAvg) / 2 - 70) * 0.08 * 10) / 10;
      }
      case 'Air Raid': {
        const wrs = db.prepare("SELECT overall_rating FROM players WHERE team_id = ? AND position = 'WR' AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 3").all(teamId) as RatingRow[];
        const wrAvg = wrs.length ? wrs.reduce((s, w) => s + w.overall_rating, 0) / wrs.length : 70;
        return Math.round((wrAvg - 70) * 0.14 * 10) / 10;
      }
      case 'Power Run': {
        const rbs = db.prepare("SELECT overall_rating FROM players WHERE team_id = ? AND position = 'RB' AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 2").all(teamId) as RatingRow[];
        const ols = db.prepare("SELECT overall_rating FROM players WHERE team_id = ? AND position = 'OL' AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 5").all(teamId) as RatingRow[];
        const rbAvg = rbs.length ? rbs.reduce((s, r) => s + r.overall_rating, 0) / rbs.length : 70;
        const olAvg = ols.length ? ols.reduce((s, o) => s + o.overall_rating, 0) / ols.length : 70;
        return Math.round(((rbAvg + olAvg) / 2 - 70) * 0.12 * 10) / 10;
      }
      case 'Spread': {
        const qb = db.prepare("SELECT throw_accuracy, speed FROM players WHERE team_id = ? AND position = 'QB' AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 1").get(teamId) as QbStatsRow | undefined;
        const qbCombo = qb ? ((qb.throw_accuracy ?? 70) + (qb.speed ?? 60)) / 2 : 65;
        return Math.round((qbCombo - 70) * 0.10 * 10) / 10;
      }
      case 'Run & Gun': {
        const off = db.prepare("SELECT overall_rating FROM players WHERE team_id = ? AND position IN ('QB','RB','WR','TE','OL') AND roster_status = 'active'").all(teamId) as RatingRow[];
        const offAvg = off.length ? off.reduce((s, p) => s + p.overall_rating, 0) / off.length : 70;
        return Math.round((offAvg - 70) * 0.07 * 10) / 10;
      }
      default: return 0;
    }
  } catch { return 0; }
}

function computeDefenseFit(teamId: number, schemeId: string): number {
  try {
    switch (schemeId) {
      case '4-3': {
        const dls = db.prepare("SELECT overall_rating FROM players WHERE team_id = ? AND position = 'DL' AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 4").all(teamId) as RatingRow[];
        const dlAvg = dls.length ? dls.reduce((s, p) => s + p.overall_rating, 0) / dls.length : 70;
        return Math.round((dlAvg - 70) * 0.12 * 10) / 10;
      }
      case '3-4': {
        const lbs = db.prepare("SELECT overall_rating FROM players WHERE team_id = ? AND position = 'LB' AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 4").all(teamId) as RatingRow[];
        const lbAvg = lbs.length ? lbs.reduce((s, p) => s + p.overall_rating, 0) / lbs.length : 70;
        return Math.round((lbAvg - 70) * 0.13 * 10) / 10;
      }
      case 'Zone Cover 2': {
        const cbs = db.prepare("SELECT coverage FROM players WHERE team_id = ? AND position = 'CB' AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 3").all(teamId) as CoverageRow[];
        const ss  = db.prepare("SELECT coverage FROM players WHERE team_id = ? AND position = 'S'  AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 2").all(teamId) as CoverageRow[];
        const dbAll = [...cbs, ...ss];
        const covAvg = dbAll.length ? dbAll.reduce((s, p) => s + (p.coverage ?? 70), 0) / dbAll.length : 70;
        return Math.round((covAvg - 70) * 0.11 * 10) / 10;
      }
      case 'Man Press': {
        const cbs = db.prepare("SELECT overall_rating FROM players WHERE team_id = ? AND position = 'CB' AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 2").all(teamId) as RatingRow[];
        const cbAvg = cbs.length ? cbs.reduce((s, p) => s + p.overall_rating, 0) / cbs.length : 70;
        return Math.round((cbAvg - 70) * 0.11 * 10) / 10;
      }
      case 'Blitz Heavy': {
        const rushers = db.prepare("SELECT pass_rush FROM players WHERE team_id = ? AND position IN ('DL','LB') AND roster_status = 'active' ORDER BY overall_rating DESC LIMIT 6").all(teamId) as PassRushRow[];
        const rushAvg = rushers.length ? rushers.reduce((s, p) => s + (p.pass_rush ?? 70), 0) / rushers.length : 70;
        return Math.round((rushAvg - 70) * 0.15 * 10) / 10;
      }
      default: return 0;
    }
  } catch { return 0; }
}

// ─── CPU Seeding ──────────────────────────────────────────────────────────────

export function seedTeamSchemes(): void {
  const teams = db.prepare('SELECT id FROM teams').all() as TeamIdRow[];
  const offOptions = OFFENSE_SCHEMES.map(s => s.id);
  const defOptions = DEFENSE_SCHEMES.map(s => s.id);
  const insert = db.prepare('INSERT OR IGNORE INTO team_schemes (team_id, offense_scheme, defense_scheme) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (const team of teams) {
      const off = offOptions[Math.floor(Math.random() * offOptions.length)];
      const def = defOptions[Math.floor(Math.random() * defOptions.length)];
      insert.run(team.id, off, def);
    }
  })();
  console.log(`Schemes seeded for ${teams.length} teams`);
}

// ─── Handler Registration ─────────────────────────────────────────────────────

export function registerSchemeHandlers(): void {
  ipcMain.handle('get-team-scheme', (_event: IpcEvent, teamId: number) => {
    const row = db.prepare('SELECT offense_scheme, defense_scheme FROM team_schemes WHERE team_id = ?').get(teamId) as SchemeDbRow | undefined;
    return {
      offenseScheme: row?.offense_scheme ?? 'West Coast',
      defenseScheme: row?.defense_scheme ?? '4-3',
    };
  });

  ipcMain.handle('get-scheme-options', (_event: IpcEvent, teamId: number) => {
    const row = db.prepare('SELECT offense_scheme, defense_scheme FROM team_schemes WHERE team_id = ?').get(teamId) as SchemeDbRow | undefined;
    const currentOff = row?.offense_scheme ?? 'West Coast';
    const currentDef = row?.defense_scheme ?? '4-3';
    return {
      currentOff,
      currentDef,
      offenseOptions: OFFENSE_SCHEMES.map(s => ({ ...s, fit: computeOffenseFit(teamId, s.id), current: s.id === currentOff })),
      defenseOptions: DEFENSE_SCHEMES.map(s => ({ ...s, fit: computeDefenseFit(teamId, s.id), current: s.id === currentDef })),
    };
  });

  ipcMain.handle('set-team-scheme', (_event: IpcEvent, payload: { teamId: number; offenseScheme?: string; defenseScheme?: string }) => {
    const { teamId, offenseScheme, defenseScheme } = payload;
    const current = db.prepare('SELECT offense_scheme, defense_scheme FROM team_schemes WHERE team_id = ?').get(teamId) as SchemeDbRow | undefined;
    const newOff = offenseScheme ?? current?.offense_scheme ?? 'West Coast';
    const newDef = defenseScheme ?? current?.defense_scheme ?? '4-3';
    db.prepare('INSERT OR REPLACE INTO team_schemes (team_id, offense_scheme, defense_scheme) VALUES (?, ?, ?)').run(teamId, newOff, newDef);
    return { success: true };
  });
}
