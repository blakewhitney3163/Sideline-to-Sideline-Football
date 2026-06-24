import { db } from '../database';
import { settingsRepo } from '../repositories';
import { logNewsEvent } from '../helpers/logNewsEvent';
import { SALARY_CAP } from '../constants';

export interface OwnerGoal {
  id: number;
  season: number;
  goal_type: string;
  target_value: number;
  achieved: number;
}

// ─── Generate goals for a new season ─────────────────────────────────────────

export function generateOwnerGoals(season: number, teamId: number): void {
  const existing = db.prepare(
    'SELECT COUNT(*) as cnt FROM owner_goals WHERE season = ?'
  ).get(season) as any;
  if ((existing?.cnt ?? 0) > 0) return;

  const teamOvr = db.prepare(
    "SELECT AVG(overall_rating) as avg_ovr FROM players WHERE team_id = ? AND roster_status = 'active'"
  ).get(teamId) as any;
  const avgOvr = Math.round(teamOvr?.avg_ovr ?? 70);

  const goals: { goal_type: string; target_value: number }[] = [];

  if (avgOvr >= 80) {
    goals.push({ goal_type: 'championship', target_value: 1 });
    goals.push({ goal_type: 'wins', target_value: 12 });
  } else if (avgOvr >= 75) {
    goals.push({ goal_type: 'playoffs', target_value: 1 });
    goals.push({ goal_type: 'wins', target_value: 10 });
  } else if (avgOvr >= 70) {
    goals.push({ goal_type: 'wins', target_value: 8 });
    goals.push({ goal_type: 'development', target_value: 1 });
  } else {
    goals.push({ goal_type: 'wins', target_value: 6 });
    goals.push({ goal_type: 'development', target_value: 1 });
    goals.push({ goal_type: 'cap_compliance', target_value: 1 });
  }

  const insert = db.prepare(
    'INSERT INTO owner_goals (season, goal_type, target_value) VALUES (?, ?, ?)'
  );
  db.transaction(() => {
    for (const g of goals) insert.run(season, g.goal_type, g.target_value);
  })();
}

// ─── Evaluate goals at season end ────────────────────────────────────────────

export function evaluateOwnerGoals(season: number, teamId: number): void {
  const goals = db.prepare(
    'SELECT * FROM owner_goals WHERE season = ?'
  ).all(season) as OwnerGoal[];
  if (goals.length === 0) return;

  const winRow = db.prepare(`
    SELECT SUM(CASE
      WHEN home_team_id = ? AND home_score > away_score THEN 1
      WHEN away_team_id = ? AND away_score > home_score THEN 1
      ELSE 0 END) as wins
    FROM games WHERE season = ? AND is_playoff = 0 AND is_simulated = 1
  `).get(teamId, teamId, season) as any;
  const wins = winRow?.wins ?? 0;

  const playoffRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM games
    WHERE season = ? AND is_playoff = 1 AND is_simulated = 1
    AND (home_team_id = ? OR away_team_id = ?)
  `).get(season, teamId, teamId) as any;
  const madePlayoffs = (playoffRow?.cnt ?? 0) > 0;

  const champRow = db.prepare(
    'SELECT COUNT(*) as cnt FROM champions WHERE season = ? AND team_id = ?'
  ).get(season, teamId) as any;
  const wonChampionship = (champRow?.cnt ?? 0) > 0;

  // Development: at least 1 player aged ≤25 who played 10+ games and has 75+ OVR
  const devRow = db.prepare(`
    SELECT COUNT(DISTINCT p.id) as cnt
    FROM players p
    JOIN (
      SELECT player_id, COUNT(DISTINCT game_id) as gp
      FROM stats WHERE season = ? GROUP BY player_id
    ) s ON s.player_id = p.id
    WHERE p.team_id = ? AND p.age <= 25 AND p.overall_rating >= 75 AND s.gp >= 10
  `).get(season, teamId) as any;
  const hasDevelopment = (devRow?.cnt ?? 0) >= 1;

  const capRow = db.prepare(`
    SELECT COALESCE(SUM(c.annual_salary), 0) as total
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id = ? AND p.roster_status = 'active'
  `).get(teamId) as any;
  const underCap = (capRow?.total ?? 0) <= SALARY_CAP;

  let achieved = 0;
  const total = goals.length;

  const update = db.prepare('UPDATE owner_goals SET achieved = ? WHERE id = ?');
  db.transaction(() => {
    for (const g of goals) {
      let hit = false;
      switch (g.goal_type) {
        case 'wins':         hit = wins >= g.target_value; break;
        case 'playoffs':     hit = madePlayoffs; break;
        case 'championship': hit = wonChampionship; break;
        case 'development':  hit = hasDevelopment; break;
        case 'cap_compliance': hit = underCap; break;
      }
      if (hit) achieved++;
      update.run(hit ? 1 : 0, g.id);
    }
  })();

  const currentPatience = parseInt(settingsRepo.get('owner_patience') ?? '75');
  let delta = 0;
  if (achieved === total)                  delta = 15;
  else if (achieved > total / 2)           delta = 5;
  else if (achieved === 1 && total >= 2)   delta = -10;
  else                                     delta = -20;

  const newPatience = Math.max(0, Math.min(100, currentPatience + delta));
  settingsRepo.set('owner_patience', String(newPatience));

  if (newPatience < 50 && currentPatience >= 50) {
    logNewsEvent({
      eventType: 'award', category: 'season',
      headline: 'Owner Growing Impatient',
      detail: 'Season results have not met ownership expectations. Pressure is mounting on the front office.',
      season: season + 1,
    });
  }
  if (newPatience < 25 && currentPatience >= 25) {
    logNewsEvent({
      eventType: 'award', category: 'season',
      headline: 'Owner Issues Final Warning',
      detail: 'Another disappointing season. Immediate improvement is required.',
      season: season + 1,
    });
  }
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export function getOwnerGoalsForSeason(season: number): OwnerGoal[] {
  return db.prepare(
    'SELECT * FROM owner_goals WHERE season = ? ORDER BY id'
  ).all(season) as OwnerGoal[];
}

export function getOwnerPatience(): number {
  return parseInt(settingsRepo.get('owner_patience') ?? '75');
}
