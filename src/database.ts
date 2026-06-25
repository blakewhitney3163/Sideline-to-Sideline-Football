import Database from 'better-sqlite3';
import { SALARY_CAP } from './constants';

let _db: Database.Database | null = null;
let _dbPath: string | null = null;

export const db = new Proxy({} as Database.Database, {
  get(_target, prop: string | symbol) {
    if (!_db) throw new Error(`DB not initialized — call initDatabase() first. (prop: ${String(prop)})`);
    const val = (_db as any)[prop];
    return typeof val === 'function' ? val.bind(_db) : val;
  },
  set(_target, prop, value) {
    if (!_db) throw new Error('DB not initialized');
    (_db as any)[prop] = value;
    return true;
  },
});

export function isDatabaseInitialized(): boolean {
  return _db !== null;
}

export function getDbPath(): string | null {
  return _dbPath;
}

// Lightweight open for worker threads — no schema setup, just opens the connection
export function openDatabase(dbPath: string): void {
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000');
}

export function closeDatabase(): void {
  if (_db) {
    try { _db.close(); } catch (_) {}
    _db = null;
    _dbPath = null;
  }
}

export function initDatabase(dbPath: string): void {
  _dbPath = dbPath;
  openDatabase(dbPath);

  // ── Base Schema ─────────────────────────────────────────────────────────────
  _db!.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      abbreviation TEXT NOT NULL,
      conference TEXT NOT NULL,
      division TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      position TEXT NOT NULL,
      position_label TEXT,
      age INTEGER NOT NULL,
      overall_rating INTEGER NOT NULL,
      speed INTEGER NOT NULL,
      strength INTEGER NOT NULL,
      awareness INTEGER NOT NULL,
      throw_accuracy INTEGER DEFAULT 0,
      throw_power INTEGER DEFAULT 0,
      catching INTEGER DEFAULT 0,
      route_running INTEGER DEFAULT 0,
      tackle_rating INTEGER DEFAULT 0,
      coverage INTEGER DEFAULT 0,
      pass_rush INTEGER DEFAULT 0,
      kickpower INTEGER DEFAULT 0,
      kickaccuracy INTEGER DEFAULT 0,
      runblocking INTEGER DEFAULT 0,
      passblocking INTEGER DEFAULT 0,
      team_id INTEGER,
      is_free_agent INTEGER DEFAULT 0,
      roster_status TEXT DEFAULT 'active',
      franchise_tagged INTEGER DEFAULT 0,
      dev_trait TEXT DEFAULT 'Normal',
      injury_status TEXT DEFAULT 'healthy',
      weeks_out INTEGER DEFAULT 0,
      injury_type TEXT,
      waived_by_team_id INTEGER,
      waiver_placed_week INTEGER,
      morale INTEGER DEFAULT 75,
      archetype TEXT NOT NULL DEFAULT 'normal',
            injury_prone INTEGER DEFAULT 0,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season INTEGER NOT NULL,
      week INTEGER NOT NULL,
      home_team_id INTEGER NOT NULL,
      away_team_id INTEGER NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      is_playoff INTEGER DEFAULT 0,
      is_simulated INTEGER DEFAULT 0,
      home_q1 INTEGER DEFAULT 0,
      home_q2 INTEGER DEFAULT 0,
      home_q3 INTEGER DEFAULT 0,
      home_q4 INTEGER DEFAULT 0,
      away_q1 INTEGER DEFAULT 0,
      away_q2 INTEGER DEFAULT 0,
      away_q3 INTEGER DEFAULT 0,
      away_q4 INTEGER DEFAULT 0,
      weather TEXT,
      FOREIGN KEY (home_team_id) REFERENCES teams(id),
      FOREIGN KEY (away_team_id) REFERENCES teams(id)
    );
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      season INTEGER,
      week INTEGER,
      is_playoff INTEGER DEFAULT 0,
      pass_attempts INTEGER DEFAULT 0,
      completions INTEGER DEFAULT 0,
      pass_yards INTEGER DEFAULT 0,
      pass_tds INTEGER DEFAULT 0,
      interceptions INTEGER DEFAULT 0,
      rush_attempts INTEGER DEFAULT 0,
      rush_yards INTEGER DEFAULT 0,
      rush_tds INTEGER DEFAULT 0,
      targets INTEGER DEFAULT 0,
      receptions INTEGER DEFAULT 0,
      rec_yards INTEGER DEFAULT 0,
      rec_tds INTEGER DEFAULT 0,
      tackles INTEGER DEFAULT 0,
      assisted_tackles INTEGER DEFAULT 0,
      sacks REAL DEFAULT 0,
      tfl INTEGER DEFAULT 0,
      forced_fumbles INTEGER DEFAULT 0,
      fumble_recoveries INTEGER DEFAULT 0,
      def_interceptions INTEGER DEFAULT 0,
      pass_deflections INTEGER DEFAULT 0,
      def_tds INTEGER DEFAULT 0,
      fg_made INTEGER DEFAULT 0,
      fg_att INTEGER DEFAULT 0,
      xp_made INTEGER DEFAULT 0,
      xp_att INTEGER DEFAULT 0,
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      years_total INTEGER NOT NULL,
      years_remaining INTEGER NOT NULL,
      annual_salary REAL NOT NULL,
      guaranteed_amount REAL DEFAULT 0,
      guaranteed_pct REAL DEFAULT 0,
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS champions (
      season INTEGER PRIMARY KEY,
      team_id INTEGER NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
    CREATE TABLE IF NOT EXISTS draft_prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      position TEXT NOT NULL,
      overall_rating INTEGER NOT NULL,
      dev_trait TEXT DEFAULT 'Normal',
      age INTEGER DEFAULT 22,
      is_drafted INTEGER DEFAULT 0,
      draft_round INTEGER,
      draft_pick INTEGER,
      drafted_by_team_id INTEGER,
      forty_time REAL,
      bench_press INTEGER,
      vertical_jump REAL,
      broad_jump INTEGER,
      cone_time REAL,
      scouted INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS depth_chart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      position_group TEXT NOT NULL,
      slot INTEGER NOT NULL,
      UNIQUE(team_id, player_id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    );
    CREATE TABLE IF NOT EXISTS career_stats_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      games INTEGER DEFAULT 0,
      completions INTEGER DEFAULT 0,
      pass_attempts INTEGER DEFAULT 0,
      pass_yards INTEGER DEFAULT 0,
      pass_tds INTEGER DEFAULT 0,
      interceptions INTEGER DEFAULT 0,
      rush_attempts INTEGER DEFAULT 0,
      rush_yards INTEGER DEFAULT 0,
      rush_tds INTEGER DEFAULT 0,
      targets INTEGER DEFAULT 0,
      receptions INTEGER DEFAULT 0,
      rec_yards INTEGER DEFAULT 0,
      rec_tds INTEGER DEFAULT 0,
      tackles REAL DEFAULT 0,
      assisted_tackles REAL DEFAULT 0,
      sacks REAL DEFAULT 0,
      tfl REAL DEFAULT 0,
      forced_fumbles REAL DEFAULT 0,
      fumble_recoveries REAL DEFAULT 0,
      def_interceptions REAL DEFAULT 0,
      pass_deflections REAL DEFAULT 0,
      def_tds REAL DEFAULT 0,
      team_id INTEGER,
      UNIQUE(player_id, season),
      FOREIGN KEY (player_id) REFERENCES players(id)
    );
    CREATE TABLE IF NOT EXISTS hall_of_fame (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      inducted_season INTEGER NOT NULL,
      dev_trait TEXT DEFAULT 'Normal',
      peak_ovr INTEGER DEFAULT 0,
      career_games INTEGER DEFAULT 0,
      career_pass_yards INTEGER DEFAULT 0,
      career_pass_tds INTEGER DEFAULT 0,
      career_rush_yards INTEGER DEFAULT 0,
      career_rush_tds INTEGER DEFAULT 0,
      career_rec_yards INTEGER DEFAULT 0,
      career_rec_tds INTEGER DEFAULT 0,
      career_receptions INTEGER DEFAULT 0,
      career_tackles REAL DEFAULT 0,
      career_sacks REAL DEFAULT 0,
      career_def_ints REAL DEFAULT 0,
      career_pass_deflections REAL DEFAULT 0,
      FOREIGN KEY (player_id) REFERENCES players(id)
    );
    CREATE TABLE IF NOT EXISTS pick_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season INTEGER NOT NULL,
      round INTEGER NOT NULL,
      original_team_id INTEGER NOT NULL,
      owner_team_id INTEGER NOT NULL,
      is_used INTEGER DEFAULT 0,
      FOREIGN KEY (original_team_id) REFERENCES teams(id),
      FOREIGN KEY (owner_team_id) REFERENCES teams(id)
    );
    CREATE TABLE IF NOT EXISTS team_trade_overrides (
      team_id INTEGER PRIMARY KEY,
      status TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
    CREATE TABLE IF NOT EXISTS historical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL,
      category TEXT NOT NULL,
      player_name TEXT NOT NULL,
      team_display TEXT,
      position TEXT,
      season INTEGER,
      games_played INTEGER DEFAULT 0,
      pass_yards INTEGER DEFAULT 0,
      pass_tds INTEGER DEFAULT 0,
      interceptions INTEGER DEFAULT 0,
      completions INTEGER DEFAULT 0,
      pass_attempts INTEGER DEFAULT 0,
      rush_yards INTEGER DEFAULT 0,
      rush_tds INTEGER DEFAULT 0,
      rush_attempts INTEGER DEFAULT 0,
      rec_yards INTEGER DEFAULT 0,
      rec_tds INTEGER DEFAULT 0,
      receptions INTEGER DEFAULT 0,
      tackles REAL DEFAULT 0,
      assisted_tackles REAL DEFAULT 0,
      sacks REAL DEFAULT 0,
      def_interceptions REAL DEFAULT 0,
      pass_deflections REAL DEFAULT 0,
      forced_fumbles REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS news_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season INTEGER NOT NULL,
      week INTEGER DEFAULT 0,
      event_type TEXT NOT NULL,
      category TEXT NOT NULL,
      headline TEXT NOT NULL,
      detail TEXT,
      team_id INTEGER,
      player_id INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
    CREATE TABLE IF NOT EXISTS player_milestones (
      player_id INTEGER NOT NULL,
      milestone_key TEXT NOT NULL,
      achieved_season INTEGER NOT NULL,
      achieved_week INTEGER NOT NULL,
      PRIMARY KEY (player_id, milestone_key),
      FOREIGN KEY (player_id) REFERENCES players(id)
    );
    CREATE TABLE IF NOT EXISTS dead_cap_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      player_id INTEGER,
      player_name TEXT,
      position TEXT,
      season INTEGER NOT NULL,
      amount REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coaching_staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER,
      role TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      overall_rating INTEGER NOT NULL DEFAULT 70,
      offense_rating INTEGER NOT NULL DEFAULT 70,
      defense_rating INTEGER NOT NULL DEFAULT 70,
      development_rating INTEGER NOT NULL DEFAULT 70,
      experience INTEGER NOT NULL DEFAULT 5,
      salary REAL NOT NULL DEFAULT 1.5,
      years_remaining INTEGER NOT NULL DEFAULT 2
    );
    CREATE TABLE IF NOT EXISTS team_schemes (
      team_id INTEGER PRIMARY KEY,
      offense_scheme TEXT NOT NULL DEFAULT 'West Coast',
      defense_scheme TEXT NOT NULL DEFAULT '4-3',
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

        CREATE TABLE IF NOT EXISTS scouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      overall_rating INTEGER NOT NULL DEFAULT 40,
      specialty TEXT NOT NULL DEFAULT 'College',
      salary REAL NOT NULL DEFAULT 1.0,
      years_on_staff INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

        CREATE TABLE IF NOT EXISTS owner_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season INTEGER NOT NULL,
      goal_type TEXT NOT NULL,
      target_value INTEGER NOT NULL,
      achieved INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS injury_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      week INTEGER NOT NULL,
      injury_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      weeks_out INTEGER NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS team_chemistry (
      team_id INTEGER PRIMARY KEY,
      chemistry INTEGER NOT NULL DEFAULT 50,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );

    CREATE TABLE IF NOT EXISTS chemistry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL,
      season INTEGER NOT NULL,
      week INTEGER NOT NULL DEFAULT 0,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      FOREIGN KEY (team_id) REFERENCES teams(id)
    );
  `);

  // ── Safe indexes ───────────────────────────────────────────────────────────
  _db!.exec(`
    CREATE INDEX IF NOT EXISTS idx_stats_game_id ON stats(game_id);
    CREATE INDEX IF NOT EXISTS idx_stats_player_id ON stats(player_id);
    CREATE INDEX IF NOT EXISTS idx_stats_team_id ON stats(team_id);
    CREATE INDEX IF NOT EXISTS idx_stats_team_game ON stats(team_id, game_id);
    CREATE INDEX IF NOT EXISTS idx_games_season ON games(season);
    CREATE INDEX IF NOT EXISTS idx_games_season_sim ON games(season, is_simulated);
    CREATE INDEX IF NOT EXISTS idx_games_season_week ON games(season, week, is_playoff);
    CREATE INDEX IF NOT EXISTS idx_news_season_week ON news_events(season, week);
    CREATE INDEX IF NOT EXISTS idx_career_stats_player ON career_stats_history(player_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_team ON contracts(team_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_player ON contracts(player_id);
    CREATE INDEX IF NOT EXISTS idx_depth_team_group ON depth_chart(team_id, position_group);
    CREATE INDEX IF NOT EXISTS idx_picks_owner_season ON pick_assets(owner_team_id, season);
    CREATE INDEX IF NOT EXISTS idx_prospects_season ON draft_prospects(season);
    CREATE INDEX IF NOT EXISTS idx_players_team_status ON players(team_id, roster_status);
    CREATE INDEX IF NOT EXISTS idx_players_status ON players(roster_status);
    CREATE INDEX IF NOT EXISTS idx_stats_season_playoff ON stats(season, is_playoff);
    CREATE INDEX IF NOT EXISTS idx_career_stats_season ON career_stats_history(player_id, season);
    CREATE INDEX IF NOT EXISTS idx_news_season_cat ON news_events(season, category);
  `);

  // ── Roster trimming ───────────────────────────────────────────────────────
  const ACTIVE_LIMIT = 53;
  const PS_LIMIT = 16;
  const oversizedTeams = _db!.prepare(
    "SELECT team_id, COUNT(*) as cnt FROM players WHERE roster_status = 'active' AND team_id IS NOT NULL GROUP BY team_id HAVING cnt > 53"
  ).all() as any[];
  if (oversizedTeams.length > 0) {
    const teamsForTrim = _db!.prepare('SELECT id FROM teams').all() as any[];
    _db!.transaction(() => {
      for (const team of teamsForTrim) {
        const active = _db!.prepare("SELECT id FROM players WHERE team_id = ? AND roster_status = 'active' ORDER BY overall_rating DESC").all(team.id) as any[];
        if (active.length > ACTIVE_LIMIT) {
          const excess = active.slice(ACTIVE_LIMIT);
          excess.forEach((p: any, i: number) => {
            if (i < PS_LIMIT) _db!.prepare("UPDATE players SET roster_status = 'practice_squad' WHERE id = ?").run(p.id);
            else _db!.prepare("UPDATE players SET roster_status = 'free_agent', team_id = NULL, is_free_agent = 1 WHERE id = ?").run(p.id);
          });
        }
      }
    })();
  }

  // ── Bootstrap defaults ────────────────────────────────────────────────────
  if (!_db!.prepare("SELECT value FROM settings WHERE key = 'current_season'").get())
    _db!.prepare("INSERT INTO settings (key, value) VALUES ('current_season', '2025')").run();

  runMigrations();
    // Must run after migrations — team_id is added by v9 on old saves
  try { _db!.exec('CREATE INDEX IF NOT EXISTS idx_career_stats_team ON career_stats_history(team_id)'); } catch {}
}

// ─── Contract Generation ──────────────────────────────────────────────────────

// Market rate table — aligned with ContractService MARKET_RATE_TABLE
const CONTRACT_MARKET_RATES: Record<string, [number, number][]> = {
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

const CONTRACT_POS_GROUP: Record<string, string> = {
  HB: 'RB', FB: 'RB',
  LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
  DE: 'DL', DT: 'DL', LE: 'DL', RE: 'DL', IDL: 'DL',
  MLB: 'LB', OLB: 'LB', LOLB: 'LB', ROLB: 'LB', MIKE: 'LB', WILL: 'LB',
  FS: 'S', SS: 'S',
};

function bootstrapFairMarket(pos: string, ovr: number): number {
  const group = CONTRACT_POS_GROUP[pos] ?? pos;
  const rates = CONTRACT_MARKET_RATES[group] ?? CONTRACT_MARKET_RATES['LB'];
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
  return base;
}

const TRAIT_PREMIUM: Record<string, number> = { Normal: 1.0, Star: 1.1, Superstar: 1.25, 'X-Factor': 1.45 };
const TRAIT_GUARANTEE: Record<string, [number, number]> = {
  Normal: [10, 35], Star: [25, 50], Superstar: [40, 65], 'X-Factor': [55, 85],
};

export function generateContracts(): void {
  db.prepare('DELETE FROM contracts').run();

  const activePlayers = db.prepare(
    "SELECT id, overall_rating, age, position, dev_trait, team_id FROM players WHERE team_id IS NOT NULL AND roster_status = 'active'"
  ).all() as any[];

  const psPlayers = db.prepare(
    "SELECT id, team_id FROM players WHERE team_id IS NOT NULL AND roster_status = 'practice_squad'"
  ).all() as any[];

  const insertContract = db.prepare(`
    INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Build per-player contract data
  interface PendingContract {
    id: number; team_id: number; salary: number;
    yearsTotal: number; yearsRemaining: number; guaranteedPct: number;
  }

  const pending: PendingContract[] = [];
  const teamTotals = new Map<number, number>();

  for (const p of activePlayers) {
    const fairMarket = bootstrapFairMarket(p.position, p.overall_rating);
    const contractFactor = 0.65 + Math.random() * 0.30;
    const salary = Math.max(1.0, Math.round(fairMarket * contractFactor * (TRAIT_PREMIUM[p.dev_trait] ?? 1.0) * 10) / 10);
    const yearsTotal =
      p.age <= 24 ? (Math.random() < 0.5 ? 5 : 4) :
      p.age <= 27 ? (Math.random() < 0.4 ? 5 : Math.random() < 0.6 ? 4 : 3) :
      p.age <= 30 ? (Math.random() < 0.4 ? 4 : Math.random() < 0.6 ? 3 : 2) :
      p.age <= 33 ? (Math.random() < 0.4 ? 3 : Math.random() < 0.5 ? 2 : 1) :
      (Math.random() < 0.3 ? 2 : 1);
    const yearsRemaining = Math.floor(Math.random() * yearsTotal) + 1;
    const [gMin, gMax] = TRAIT_GUARANTEE[p.dev_trait] ?? [10, 35];
    const guaranteedPct = Math.round(gMin + Math.random() * (gMax - gMin));
    pending.push({ id: p.id, team_id: p.team_id, salary, yearsTotal, yearsRemaining, guaranteedPct });
    teamTotals.set(p.team_id, (teamTotals.get(p.team_id) ?? 0) + salary);
  }

  // Scale down any team that's over 95% of the cap
  const CAP_TARGET = SALARY_CAP * 0.95;
for (const contract of pending) {
  const total = teamTotals.get(contract.team_id) ?? 0;
  contract.salary = Math.max(1.0, Math.round(contract.salary * (CAP_TARGET / total) * 10) / 10);
}

  db.transaction(() => {
    for (const c of pending) {
      insertContract.run(
        c.id, c.team_id, c.yearsTotal, c.yearsRemaining, c.salary,
        Math.round(c.salary * c.yearsTotal * (c.guaranteedPct / 100) * 10) / 10,
        c.guaranteedPct
      );
    }
    for (const p of psPlayers) insertContract.run(p.id, p.team_id, 1, 1, 1.165, 0, 0);
  })();

  console.log(`Contracts generated: ${activePlayers.length} active + ${psPlayers.length} PS`);
}

// ─── Migration Versioning ─────────────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = 16;

interface Migration { version: number; description: string; up: () => void; }

const MIGRATIONS: Migration[] = [
  {
    version: 9,
    description: 'Add team_id to career_stats_history for franchise records',
    up: () => {
      const cols = (db.prepare('PRAGMA table_info(career_stats_history)').all() as any[]).map((c: any) => c.name);
      if (!cols.includes('team_id'))
        db.prepare('ALTER TABLE career_stats_history ADD COLUMN team_id INTEGER').run();
      db.exec('CREATE INDEX IF NOT EXISTS idx_career_stats_team ON career_stats_history(team_id)');
    },
  },
  {
    version: 10,
    description: 'Recalibrate contract salaries to market-rate scale',
    up: () => {
      const players = db.prepare(`
        SELECT p.id, p.overall_rating, p.position, p.dev_trait, c.years_total, c.years_remaining, c.guaranteed_pct
        FROM contracts c JOIN players p ON c.player_id = p.id
        WHERE p.roster_status = 'active'
      `).all() as any[];
      const updateContract = db.prepare(
        'UPDATE contracts SET annual_salary = ?, guaranteed_amount = ? WHERE player_id = ?'
      );
      for (const p of players) {
        const fairMarket = bootstrapFairMarket(p.position, p.overall_rating);
        const contractFactor = 0.72 + Math.random() * 0.20;
        const salary = Math.max(1.0, Math.round(fairMarket * contractFactor * (TRAIT_PREMIUM[p.dev_trait] ?? 1.0) * 10) / 10);
        const gtd = Math.round(salary * p.years_total * ((p.guaranteed_pct ?? 20) / 100) * 10) / 10;
        updateContract.run(salary, gtd, p.id);
      }
    },
  },
  {
    version: 11,
    description: 'Normalize all team salary totals to 95% of salary cap',
    up: () => {
      const CAP_TARGET = SALARY_CAP * 0.95;
      const teamRows = db.prepare(`
        SELECT c.team_id, SUM(c.annual_salary) as total_salary
        FROM contracts c
        JOIN players p ON c.player_id = p.id
        WHERE p.roster_status = 'active'
        GROUP BY c.team_id
      `).all() as any[];

      const updateSalary = db.prepare(
        'UPDATE contracts SET annual_salary = ?, guaranteed_amount = ? WHERE player_id = ?'
      );

      for (const team of teamRows as any[]) {
        if (Math.abs(team.total_salary - CAP_TARGET) < 5) continue;
        const scale = CAP_TARGET / team.total_salary;
        const contracts = db.prepare(`
          SELECT c.player_id, c.annual_salary, c.years_total, c.guaranteed_pct
          FROM contracts c
          JOIN players p ON c.player_id = p.id
          WHERE c.team_id = ? AND p.roster_status = 'active'
        `).all(team.team_id) as any[];
        for (const c of contracts) {
          const newSalary = Math.max(1.0, Math.round(c.annual_salary * scale * 10) / 10);
          const newGtd = Math.round(newSalary * c.years_total * ((c.guaranteed_pct ?? 20) / 100) * 10) / 10;
          updateSalary.run(newSalary, newGtd, c.player_id);
        }
      }
    },
  },
  {
    version: 12,
    description: 'Add owner_goals table and owner_patience setting',
    up: () => {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS owner_goals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          season INTEGER NOT NULL,
          goal_type TEXT NOT NULL,
          target_value INTEGER NOT NULL,
          achieved INTEGER DEFAULT 0
        )
      `).run();
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('owner_patience', '75')").run();
    },
  },
  {
    version: 13,
    description: 'Add injury_history table and injury_prone flag on players',
    up: () => {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS injury_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id INTEGER NOT NULL,
          season INTEGER NOT NULL,
          week INTEGER NOT NULL,
          injury_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          weeks_out INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (player_id) REFERENCES players(id)
        )
      `).run();
      db.exec('CREATE INDEX IF NOT EXISTS idx_injury_history_player ON injury_history(player_id)');

      const playerCols = (db.prepare('PRAGMA table_info(players)').all() as any[]).map((c: any) => c.name);
      if (!playerCols.includes('injury_prone'))
        db.prepare('ALTER TABLE players ADD COLUMN injury_prone INTEGER DEFAULT 0').run();
    },
  },
    {
    version: 14,
    description: 'Add team_chemistry and chemistry_events tables',
    up: () => {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS team_chemistry (
          team_id INTEGER PRIMARY KEY,
          chemistry INTEGER NOT NULL DEFAULT 50,
          FOREIGN KEY (team_id) REFERENCES teams(id)
        )
      `).run();
      db.prepare(`
        CREATE TABLE IF NOT EXISTS chemistry_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER NOT NULL,
          season INTEGER NOT NULL,
          week INTEGER NOT NULL DEFAULT 0,
          delta INTEGER NOT NULL,
          reason TEXT NOT NULL,
          FOREIGN KEY (team_id) REFERENCES teams(id)
        )
      `).run();
      db.exec('CREATE INDEX IF NOT EXISTS idx_chem_events_team ON chemistry_events(team_id, season)');
      // Seed chemistry = 50 for all existing teams
      const teams = db.prepare('SELECT id FROM teams').all() as any[];
      const insert = db.prepare('INSERT OR IGNORE INTO team_chemistry (team_id, chemistry) VALUES (?, 50)');
      db.transaction(() => { for (const t of teams) insert.run(t.id); })();
    },
  },
  {
    version: 15,
    description: 'Add archetype column to players for personality system',
    up: () => {
      db.prepare(
        "ALTER TABLE players ADD COLUMN archetype TEXT NOT NULL DEFAULT 'normal'"
      ).run();
    },
  },

    {
    version: 16,
    description: 'Add scouts table for week-by-week scouting system',
    up: () => {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS scouts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          overall_rating INTEGER NOT NULL DEFAULT 40,
          specialty TEXT NOT NULL DEFAULT 'College',
          salary REAL NOT NULL DEFAULT 1.0,
          years_on_staff INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (team_id) REFERENCES teams(id)
        )
      `).run();
    },
  },
];

function getSchemaVersion(): number {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get() as any;
    return row ? parseInt(row.value, 10) : 0;
  } catch { return 0; }
}

function setSchemaVersion(version: number): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)").run(String(version));
}

export function runMigrations(): void {
  const currentVersion = getSchemaVersion();
  if (currentVersion === 0) {
    setSchemaVersion(CURRENT_SCHEMA_VERSION);
    console.log(`Schema stamped at v${CURRENT_SCHEMA_VERSION} (baseline)`);
    return;
  }
  const pending = MIGRATIONS.filter(m => m.version > currentVersion).sort((a, b) => a.version - b.version);
  if (pending.length === 0) { console.log(`Schema up to date (v${currentVersion})`); return; }
  for (const migration of pending) {
    try {
      db.transaction(() => migration.up())();
      setSchemaVersion(migration.version);
      console.log(`Migration v${migration.version} applied: ${migration.description}`);
    } catch (err) {
      console.error(`Migration v${migration.version} FAILED:`, err);
      throw err;
    }
  }
}
