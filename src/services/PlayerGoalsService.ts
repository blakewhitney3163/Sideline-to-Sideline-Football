import { db } from '../database';
import { logNewsEvent } from '../helpers/logNewsEvent';

// ─── Position → stat target mapping ──────────────────────────────────────────
const STAT_TARGETS: Record<string, { stat: string; target: number; label: string }> = {
  QB:   { stat: 'pass_yards',          target: 3500, label: '3,500+ pass yards'      },
  RB:   { stat: 'rush_yards',          target: 1000, label: '1,000+ rush yards'      },
  HB:   { stat: 'rush_yards',          target: 1000, label: '1,000+ rush yards'      },
  FB:   { stat: 'rush_yards',          target: 500,  label: '500+ rush yards'        },
  WR:   { stat: 'rec_yards',           target: 900,  label: '900+ receiving yards'   },
  TE:   { stat: 'rec_yards',           target: 700,  label: '700+ receiving yards'   },
  DE:   { stat: 'sacks',               target: 8,    label: '8+ sacks'               },
  DT:   { stat: 'sacks',               target: 6,    label: '6+ sacks'               },
  LE:   { stat: 'sacks',               target: 8,    label: '8+ sacks'               },
  RE:   { stat: 'sacks',               target: 8,    label: '8+ sacks'               },
  DL:   { stat: 'sacks',               target: 8,    label: '8+ sacks'               },
  IDL:  { stat: 'sacks',               target: 6,    label: '6+ sacks'               },
  LB:   { stat: 'tackles',             target: 100,  label: '100+ tackles'           },
  MLB:  { stat: 'tackles',             target: 100,  label: '100+ tackles'           },
  OLB:  { stat: 'tackles',             target: 80,   label: '80+ tackles'            },
  LOLB: { stat: 'tackles',             target: 80,   label: '80+ tackles'            },
  ROLB: { stat: 'tackles',             target: 80,   label: '80+ tackles'            },
  CB:   { stat: 'def_interceptions',   target: 4,    label: '4+ interceptions'       },
  S:    { stat: 'def_interceptions',   target: 3,    label: '3+ interceptions'       },
  FS:   { stat: 'def_interceptions',   target: 3,    label: '3+ interceptions'       },
  SS:   { stat: 'def_interceptions',   target: 3,    label: '3+ interceptions'       },
};

// ─── Simplified market rate for contract goal threshold ───────────────────────
const MARKET_RATES: Record<string, [number, number][]> = {
  QB:  [[92,52],[87,34],[82,17],[77,8]],
  WR:  [[92,34],[87,21],[82,12],[77,5]],
  DL:  [[92,28],[87,18],[82,10],[77,4]],
  CB:  [[92,24],[87,16],[82,8], [77,3]],
  LB:  [[92,19],[87,13],[82,6], [77,2.5]],
  OL:  [[92,27],[87,19],[82,11],[77,4]],
  TE:  [[92,21],[87,13],[82,6], [77,2.5]],
  S:   [[92,17],[87,11],[82,5], [77,2.5]],
  RB:  [[92,14],[87,9], [82,4], [77,2]],
};

function marketAsk(position: string, ovr: number): number {
  const POS_GROUP: Record<string, string> = {
    HB:'RB', FB:'RB',
    DE:'DL', DT:'DL', LE:'DL', RE:'DL', IDL:'DL',
    MLB:'LB', OLB:'LB', LOLB:'LB', ROLB:'LB',
    LT:'OL', LG:'OL', C:'OL', RG:'OL', RT:'OL',
    FS:'S',  SS:'S',
  };
  const group = POS_GROUP[position] ?? position;
  const table = MARKET_RATES[group] ?? MARKET_RATES['LB'];
  for (const [thresh, sal] of table) {
    if (ovr >= thresh) return sal;
  }
  return 1.5;
}

// ─── Generate goals for the user's team at the START of a season ──────────────
export function generatePlayerGoals(season: number, userTeamId: number): void {
  // Idempotent
  const key = `player_goals_generated_${season}`;
  if (db.prepare("SELECT value FROM settings WHERE key = ?").get(key)) return;

  const players = db.prepare(`
    SELECT p.id, p.position, p.overall_rating, p.age, p.morale,
           c.years_remaining, c.annual_salary
    FROM players p
    LEFT JOIN contracts c ON c.player_id = p.id
    WHERE p.team_id = ? AND p.roster_status = 'active'
  `).all(userTeamId) as any[];

  const insert = db.prepare(`
    INSERT INTO player_goals (player_id, goal_type, target_value, season, status)
    VALUES (?, ?, ?, ?, 'active')
  `);

  db.transaction(() => {
    for (const p of players) {
      // Starter role: OVR 72+
      if (p.overall_rating >= 72) {
        insert.run(p.id, 'starter_role', 1, season);
      }

      // Contract goal: OVR 82+, final year, underpaid
      if (p.overall_rating >= 82 && (p.years_remaining ?? 99) === 1) {
        const ask = marketAsk(p.position, p.overall_rating);
        if ((p.annual_salary ?? 0) < ask * 0.88) {
          insert.run(p.id, 'top_contract', ask, season);
        }
      }

      // Contender goal: OVR 84+, age 27+
      if (p.overall_rating >= 84 && p.age >= 27) {
        insert.run(p.id, 'contender', 1, season);
      }

      // Stats milestone: OVR 76+, known skill position
      const posMeta = STAT_TARGETS[p.position];
      if (posMeta && p.overall_rating >= 76) {
        insert.run(p.id, 'stats_milestone', posMeta.target, season);
      }
    }
  })();

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, '1')").run(key);
}

// ─── Evaluate goals at the END of a season ────────────────────────────────────
export function evaluatePlayerGoals(completedSeason: number): void {
  const goals = db.prepare(`
    SELECT pg.*, p.position, p.team_id, p.overall_rating, p.morale
    FROM player_goals pg
    JOIN players p ON p.id = pg.player_id
    WHERE pg.season = ? AND pg.status = 'active'
  `).all(completedSeason) as any[];

  if (goals.length === 0) return;

  // Season stats per player
  const statsRows = db.prepare(`
    SELECT player_id,
      SUM(pass_yards) as pass_yards, SUM(rush_yards) as rush_yards,
      SUM(rec_yards) as rec_yards, SUM(CAST(sacks AS REAL)) as sacks,
      SUM(tackles) + SUM(assisted_tackles) as tackles,
      SUM(def_interceptions) as def_interceptions,
      COUNT(DISTINCT game_id) as games
    FROM stats WHERE season = ? AND is_playoff = 0
    GROUP BY player_id
  `).all(completedSeason) as any[];
  const statsMap = new Map<number, any>(statsRows.map((r: any) => [r.player_id, r]));

  // Playoff teams
  const playoffTeamRows = db.prepare(`
    SELECT DISTINCT home_team_id as t FROM games WHERE season = ? AND is_playoff = 1
    UNION SELECT DISTINCT away_team_id FROM games WHERE season = ? AND is_playoff = 1
  `).all(completedSeason, completedSeason) as any[];
  const playoffTeams = new Set(playoffTeamRows.map((r: any) => r.t));

  const updStatus = db.prepare('UPDATE player_goals SET status = ? WHERE id = ?');

  db.transaction(() => {
    for (const goal of goals) {
      const s = statsMap.get(goal.player_id);
      let achieved = false;

      switch (goal.goal_type) {
        case 'starter_role':
          // Achieved if they played 12+ games
          achieved = s && (s.games ?? 0) >= 12;
          break;

        case 'top_contract': {
          const contract = db.prepare('SELECT annual_salary FROM contracts WHERE player_id = ?').get(goal.player_id) as any;
          achieved = !!(contract && contract.annual_salary >= (goal.target_value ?? 999) * 0.85);
          break;
        }

        case 'contender':
          achieved = playoffTeams.has(goal.team_id);
          break;

        case 'stats_milestone': {
          if (!s) { achieved = false; break; }
          const pos = goal.position as string;
          if (pos === 'QB') achieved = (s.pass_yards ?? 0) >= (goal.target_value ?? 9999);
          else if (['RB','HB','FB'].includes(pos)) achieved = (s.rush_yards ?? 0) >= (goal.target_value ?? 9999);
          else if (['WR','TE'].includes(pos)) achieved = (s.rec_yards ?? 0) >= (goal.target_value ?? 9999);
          else if (['DE','DT','LE','RE','DL','IDL'].includes(pos)) achieved = (s.sacks ?? 0) >= (goal.target_value ?? 9999);
          else if (['LB','MLB','OLB','LOLB','ROLB'].includes(pos)) achieved = (s.tackles ?? 0) >= (goal.target_value ?? 9999);
          else if (['CB','S','FS','SS'].includes(pos)) achieved = (s.def_interceptions ?? 0) >= (goal.target_value ?? 9999);
          break;
        }
      }

      updStatus.run(achieved ? 'achieved' : 'failed', goal.id);

      // Morale impact
      const delta = achieved ? 5 : -5;
      db.prepare('UPDATE players SET morale = MIN(100, MAX(40, morale + ?)) WHERE id = ?').run(delta, goal.player_id);

      // Failed non-starter goals on expiring contracts → extra morale hit (feeds holdout system)
      if (!achieved && goal.goal_type !== 'starter_role') {
        const contract = db.prepare('SELECT years_remaining FROM contracts WHERE player_id = ?').get(goal.player_id) as any;
        if (contract?.years_remaining === 1) {
          db.prepare('UPDATE players SET morale = MIN(100, MAX(40, morale - 5)) WHERE id = ?').run(goal.player_id);
        }
      }
    }
  })();
}

// ─── Read goals for a team + season (UI) ─────────────────────────────────────
export function getTeamPlayerGoals(teamId: number, season: number): any[] {
  return db.prepare(`
    SELECT pg.id, pg.player_id, pg.goal_type, pg.target_value, pg.season, pg.status,
           p.first_name, p.last_name, p.position, p.overall_rating, p.age
    FROM player_goals pg
    JOIN players p ON p.id = pg.player_id
    WHERE p.team_id = ? AND pg.season = ?
    ORDER BY p.overall_rating DESC, pg.goal_type
  `).all(teamId, season) as any[];
}
