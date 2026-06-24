import { db } from '../database';
import { getCurrentSeason } from '../helpers/getCurrentSeason';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN = 0;
const MAX = 100;

function clamp(v: number): number {
  return Math.max(MIN, Math.min(MAX, Math.round(v)));
}

// ─── Core Read/Write ──────────────────────────────────────────────────────────

export function getTeamChemistry(teamId: number): number {
  try {
    const row = db.prepare('SELECT chemistry FROM team_chemistry WHERE team_id = ?').get(teamId) as any;
    if (row) return row.chemistry;
    db.prepare('INSERT OR IGNORE INTO team_chemistry (team_id, chemistry) VALUES (?, 50)').run(teamId);
    return 50;
  } catch { return 50; }
}

function applyDelta(
  teamId: number,
  delta: number,
  reason: string,
  season: number,
  week: number
): void {
  try {
    db.prepare('INSERT OR IGNORE INTO team_chemistry (team_id, chemistry) VALUES (?, 50)').run(teamId);
    const current = getTeamChemistry(teamId);
    const next = clamp(current + delta);
    db.prepare('UPDATE team_chemistry SET chemistry = ? WHERE team_id = ?').run(next, teamId);
    if (delta !== 0) {
      db.prepare(`
        INSERT INTO chemistry_events (team_id, season, week, delta, reason)
        VALUES (?, ?, ?, ?, ?)
      `).run(teamId, season, week, delta, reason);
    }
  } catch (err) {
    console.error('ChemistryService.applyDelta error:', err);
  }
}

// ─── Game Result ──────────────────────────────────────────────────────────────

export function processGameResult(
  teamId: number,
  won: boolean,
  scoreDiff: number,
  season: number,
  week: number
): void {
  const margin = Math.abs(scoreDiff);
  let delta: number;
  let reason: string;

  if (won) {
    delta = margin >= 14 ? 5 : margin >= 7 ? 3 : 2;
    reason = margin >= 14 ? 'Dominant win (+5)' : margin >= 7 ? 'Solid win (+3)' : 'Close win (+2)';
  } else {
    delta = margin >= 14 ? -5 : margin >= 7 ? -3 : -2;
    reason = margin >= 14 ? 'Blowout loss (−5)' : margin >= 7 ? 'Loss (−3)' : 'Close loss (−2)';
  }

  applyDelta(teamId, delta, reason, season, week);
}

// ─── Roster Moves ─────────────────────────────────────────────────────────────

export function processRosterMove(
  teamId: number,
  moveType: 'trade_out' | 'release' | 'fa_sign' | 'draft_join',
  playerOvr: number,
  playerName: string,
  season: number,
  week = 0
): void {
  let delta = 0;
  let reason = '';

  const isStar = playerOvr >= 80;

  switch (moveType) {
    case 'trade_out':
      delta = isStar ? -10 : -3;
      reason = isStar
        ? `Star traded away: ${playerName} (−10)`
        : `Player traded away: ${playerName} (−3)`;
      break;
    case 'release':
      delta = isStar ? -8 : -2;
      reason = isStar
        ? `Star released: ${playerName} (−8)`
        : `Player released: ${playerName} (−2)`;
      break;
    case 'fa_sign':
      delta = isStar ? 5 : 2;
      reason = isStar
        ? `Star signed: ${playerName} (+5)`
        : `FA signed: ${playerName} (+2)`;
      break;
    case 'draft_join':
      delta = 2;
      reason = `Draft pick joined: ${playerName} (+2)`;
      break;
  }

  if (delta !== 0) applyDelta(teamId, delta, reason, season, week);
}

// ─── Morale Drag (call weekly) ────────────────────────────────────────────────

export function processMoraleDrag(teamId: number, season: number, week: number): void {
  try {
    const lowMoraleCount = (db.prepare(`
      SELECT COUNT(*) as cnt FROM players
      WHERE team_id = ? AND roster_status = 'active' AND morale < 40
    `).get(teamId) as any)?.cnt ?? 0;

    if (lowMoraleCount > 0) {
      const delta = -Math.min(lowMoraleCount, 5); // cap at -5 per week
      applyDelta(teamId, delta, `Low morale players: ${lowMoraleCount} (${delta})`, season, week);
    }
  } catch {}
}

// ─── Archetype Hook (stub — wired when Player Personality Archetypes ships) ──

export function applyArchetypeModifiers(_teamId: number, _season: number, _week: number): void {
  // Future: loop over starters, apply per-archetype chemistry deltas:
  // 'team_leader'   → +3
  // 'vocal_leader'  → +5
  // 'troublemaker'  → -3 (or -8 if morale < 40)
  // 'selfish'       → -5 if morale < 50
}

// ─── Sim Rating Modifier ──────────────────────────────────────────────────────

export function getChemistryModifier(teamId: number): number {
  const chem = getTeamChemistry(teamId);
  if (chem >= 90) return 3;
  if (chem >= 75) return 2;
  if (chem >= 60) return 1;
  if (chem >= 40) return 0;
  if (chem >= 30) return -2;
  return -4;
}

// ─── Recent Events for UI ─────────────────────────────────────────────────────

export function getRecentChemistryEvents(teamId: number, season: number, limit = 5) {
  return db.prepare(`
    SELECT id, week, delta, reason
    FROM chemistry_events
    WHERE team_id = ? AND season = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(teamId, season, limit) as { id: number; week: number; delta: number; reason: string }[];
}

// ─── Season Init ──────────────────────────────────────────────────────────────

export function initAllTeamChemistry(): void {
  try {
    const teams = db.prepare('SELECT id FROM teams').all() as any[];
    const insert = db.prepare('INSERT OR IGNORE INTO team_chemistry (team_id, chemistry) VALUES (?, 50)');
    db.transaction(() => { for (const t of teams) insert.run(t.id); })();
  } catch {}
}
