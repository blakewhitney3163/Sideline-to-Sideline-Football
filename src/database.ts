import Database from 'better-sqlite3';

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
      age INTEGER NOT NULL,
      overall_rating INTEGER NOT NULL,
      speed INTEGER NOT NULL,
      strength INTEGER NOT NULL,
      awareness INTEGER NOT NULL,
      team_id INTEGER,
      is_free_agent INTEGER DEFAULT 0,
      roster_status TEXT DEFAULT 'active',
      franchise_tagged INTEGER DEFAULT 0,
      dev_trait TEXT DEFAULT 'Normal',
      position_label TEXT,
      injury_status TEXT DEFAULT 'healthy',
      weeks_out INTEGER DEFAULT 0,
      injury_type TEXT,
      morale INTEGER DEFAULT 75,
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
  `);

  // ── Safe indexes (no season-dependent ones here) ──────────────────────────
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
  `);

  // ── Stats column migrations — must run before the season index ────────────
  const statCols = (_db!.prepare('PRAGMA table_info(stats)').all() as any[]).map((c: any) => c.name);
  const statMigrations: [string, string][] = [
    ['season', 'INTEGER'],
    ['week', 'INTEGER'],
    ['is_playoff', 'INTEGER DEFAULT 0'],
    ['tackles', 'INTEGER DEFAULT 0'],
    ['assisted_tackles', 'INTEGER DEFAULT 0'],
    ['sacks', 'REAL DEFAULT 0'],
    ['tfl', 'INTEGER DEFAULT 0'],
    ['forced_fumbles', 'INTEGER DEFAULT 0'],
    ['fumble_recoveries', 'INTEGER DEFAULT 0'],
    ['def_interceptions', 'INTEGER DEFAULT 0'],
    ['pass_deflections', 'INTEGER DEFAULT 0'],
    ['def_tds', 'INTEGER DEFAULT 0'],
    ['fg_made', 'INTEGER DEFAULT 0'],
    ['fg_att', 'INTEGER DEFAULT 0'],
    ['xp_made', 'INTEGER DEFAULT 0'],
    ['xp_att', 'INTEGER DEFAULT 0'],
  ];
  for (const [col, type] of statMigrations) {
    if (!statCols.includes(col))
      _db!.prepare(`ALTER TABLE stats ADD COLUMN ${col} ${type}`).run();
  }

  // Now safe to create the season-dependent index
  _db!.exec(`CREATE INDEX IF NOT EXISTS idx_stats_season_playoff ON stats(season, is_playoff);`);

  // ── Games column migrations ───────────────────────────────────────────────
  const gameCols = (_db!.prepare('PRAGMA table_info(games)').all() as any[]).map((c: any) => c.name);
  const gameColMigrations: [string, string][] = [
    ['home_q1', 'INTEGER DEFAULT 0'], ['home_q2', 'INTEGER DEFAULT 0'],
    ['home_q3', 'INTEGER DEFAULT 0'], ['home_q4', 'INTEGER DEFAULT 0'],
    ['away_q1', 'INTEGER DEFAULT 0'], ['away_q2', 'INTEGER DEFAULT 0'],
    ['away_q3', 'INTEGER DEFAULT 0'], ['away_q4', 'INTEGER DEFAULT 0'],
    ['weather', 'TEXT'],
  ];
  for (const [col, type] of gameColMigrations) {
    if (!gameCols.includes(col))
      _db!.prepare(`ALTER TABLE games ADD COLUMN ${col} ${type}`).run();
  }

  // ── Players column migrations ─────────────────────────────────────────────
  const playerCols: any[] = _db!.prepare('PRAGMA table_info(players)').all() as any[];
  const playerColNames = playerCols.map((c: any) => c.name);

  if (!playerColNames.includes('position_label'))
    _db!.prepare('ALTER TABLE players ADD COLUMN position_label TEXT').run();

  if (!playerColNames.includes('dev_trait')) {
    _db!.prepare("ALTER TABLE players ADD COLUMN dev_trait TEXT DEFAULT 'Normal'").run();
    const allPlayers = _db!.prepare('SELECT id, overall_rating FROM players').all() as any[];
    const assignTrait = _db!.prepare('UPDATE players SET dev_trait = ? WHERE id = ?');
    _db!.transaction(() => {
      for (const player of allPlayers) {
        const ovr: number = player.overall_rating;
        const rand = Math.random();
        let trait: string;
        if (ovr >= 90) trait = rand < 0.05 ? 'X-Factor' : rand < 0.25 ? 'Superstar' : rand < 0.85 ? 'Star' : 'Normal';
        else if (ovr >= 85) trait = rand < 0.02 ? 'X-Factor' : rand < 0.14 ? 'Superstar' : rand < 0.74 ? 'Star' : 'Normal';
        else if (ovr >= 80) trait = rand < 0.005 ? 'X-Factor' : rand < 0.055 ? 'Superstar' : rand < 0.505 ? 'Star' : 'Normal';
        else if (ovr >= 70) trait = rand < 0.001 ? 'X-Factor' : rand < 0.011 ? 'Superstar' : rand < 0.211 ? 'Star' : 'Normal';
        else trait = rand < 0.04 ? 'Star' : 'Normal';
        assignTrait.run(trait, player.id);
      }
    })();
  }

  if (!playerColNames.includes('roster_status')) {
    _db!.prepare("ALTER TABLE players ADD COLUMN roster_status TEXT DEFAULT 'active'").run();
    _db!.prepare("UPDATE players SET roster_status = 'free_agent' WHERE is_free_agent = 1").run();
    _db!.prepare("UPDATE players SET roster_status = 'active' WHERE is_free_agent = 0 AND team_id IS NOT NULL").run();
  }

  if (!playerColNames.includes('franchise_tagged'))
    _db!.prepare('ALTER TABLE players ADD COLUMN franchise_tagged INTEGER DEFAULT 0').run();

  const basicPlayerExtras: [string, string][] = [
    ['injury_status', "TEXT DEFAULT 'healthy'"],
    ['weeks_out', 'INTEGER DEFAULT 0'],
    ['injury_type', 'TEXT'],
    ['waived_by_team_id', 'INTEGER'],
    ['waiver_placed_week', 'INTEGER'],
    ['morale', 'INTEGER DEFAULT 75'],
  ];
  const freshPlayerCols1 = (_db!.prepare('PRAGMA table_info(players)').all() as any[]).map((c: any) => c.name);
  for (const [col, def] of basicPlayerExtras) {
    if (!freshPlayerCols1.includes(col))
      _db!.prepare(`ALTER TABLE players ADD COLUMN ${col} ${def}`).run();
  }

  const maddenCols = [
    'agility', 'acceleration', 'stamina', 'toughness', 'injury', 'jumping', 'trucking',
    'changeofdirection', 'playrecognition', 'throwpower', 'throwaccuracyshort',
    'throwaccuracymid', 'throwaccuracydeep', 'playaction', 'throwonrun', 'carrying',
    'ballcarriervision', 'stiffarm', 'spinmove', 'jukemove', 'catching',
    'shortrouterunning', 'midrouterunning', 'deeprouterunning', 'spectacularcatch',
    'catchintraffic', 'release', 'runblocking', 'passblocking', 'impactblocking',
    'mancoverage', 'zonecoverage', 'tackle', 'hitpower', 'press', 'pursuit',
    'kickaccuracy', 'kickpower', 'kick_return', 'jerseynumber', 'yearspro',
    'throw_accuracy', 'throw_power', 'route_running', 'tackle_rating',
    'coverage', 'pass_rush', 'kick_power', 'kick_accuracy',
  ];
  const freshPlayerCols2 = (_db!.prepare('PRAGMA table_info(players)').all() as any[]).map((c: any) => c.name);
  for (const col of maddenCols) {
    if (!freshPlayerCols2.includes(col))
      _db!.prepare(`ALTER TABLE players ADD COLUMN ${col} INTEGER DEFAULT 0`).run();
  }

  // ── Contracts column migrations ───────────────────────────────────────────
  const contractCols = (_db!.prepare('PRAGMA table_info(contracts)').all() as any[]).map((c: any) => c.name);
  if (!contractCols.includes('guaranteed_amount'))
    _db!.prepare('ALTER TABLE contracts ADD COLUMN guaranteed_amount REAL DEFAULT 0').run();
  if (!contractCols.includes('guaranteed_pct'))
    _db!.prepare('ALTER TABLE contracts ADD COLUMN guaranteed_pct REAL DEFAULT 0').run();

  // ── Draft prospects column migrations ─────────────────────────────────────
  const prospectCols = (_db!.prepare('PRAGMA table_info(draft_prospects)').all() as any[]).map((c: any) => c.name);
  if (!prospectCols.includes('scouted'))
    _db!.prepare('ALTER TABLE draft_prospects ADD COLUMN scouted INTEGER DEFAULT 0').run();

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
}

// ─── Contract Generation ──────────────────────────────────────────────────────

const SAL_RANGES: Record<string, [number, number]> = {
  QB: [1.0, 42], WR: [1.0, 28], DL: [1.0, 32], LB: [1.0, 18],
  CB: [1.0, 22], TE: [1.0, 16], OL: [1.0, 22], S: [1.0, 18],
  RB: [1.0, 16], K: [1.0, 4],
};
const TRAIT_PREMIUM: Record<string, number> = { Normal: 1.0, Star: 1.15, Superstar: 1.3, 'X-Factor': 1.5 };
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
  db.transaction(() => {
    for (const p of activePlayers) {
      const [minSal, maxSal] = SAL_RANGES[p.position] ?? [1.0, 15];
      const ovrFactor = Math.pow(Math.max(0, (p.overall_rating - 70)) / 29, 2.5);
      const salary = Math.round((minSal + ovrFactor * (maxSal - minSal)) * (TRAIT_PREMIUM[p.dev_trait] ?? 1.0) * 10) / 10;
      const yearsTotal =
        p.age <= 24 ? (Math.random() < 0.5 ? 5 : 4) :
        p.age <= 27 ? (Math.random() < 0.4 ? 5 : Math.random() < 0.6 ? 4 : 3) :
        p.age <= 30 ? (Math.random() < 0.4 ? 4 : Math.random() < 0.6 ? 3 : 2) :
        p.age <= 33 ? (Math.random() < 0.4 ? 3 : Math.random() < 0.5 ? 2 : 1) :
        (Math.random() < 0.3 ? 2 : 1);
      const yearsRemaining = Math.floor(Math.random() * yearsTotal) + 1;
      const [gMin, gMax] = TRAIT_GUARANTEE[p.dev_trait] ?? [10, 35];
      const guaranteedPct = Math.round(gMin + Math.random() * (gMax - gMin));
      insertContract.run(p.id, p.team_id, yearsTotal, yearsRemaining, salary,
        Math.round(salary * yearsTotal * (guaranteedPct / 100) * 10) / 10, guaranteedPct);
    }
    for (const p of psPlayers) insertContract.run(p.id, p.team_id, 1, 1, 1.165, 0, 0);
  })();
  console.log(`Contracts generated: ${activePlayers.length} active + ${psPlayers.length} PS`);
}

// ─── Migration Versioning ─────────────────────────────────────────────────────

const CURRENT_SCHEMA_VERSION = 7;

interface Migration { version: number; description: string; up: () => void; }

const MIGRATIONS: Migration[] = [
  {
    version: 2,
    description: 'Denormalize season/week/is_playoff onto stats for direct indexed access',
    up: () => {
      const cols = (db.prepare('PRAGMA table_info(stats)').all() as any[]).map((c: any) => c.name);
      if (!cols.includes('season')) db.prepare('ALTER TABLE stats ADD COLUMN season INTEGER').run();
      if (!cols.includes('week')) db.prepare('ALTER TABLE stats ADD COLUMN week INTEGER').run();
      if (!cols.includes('is_playoff')) db.prepare('ALTER TABLE stats ADD COLUMN is_playoff INTEGER DEFAULT 0').run();
      db.prepare(`
        UPDATE stats
        SET season = (SELECT season FROM games WHERE games.id = stats.game_id),
            week = (SELECT week FROM games WHERE games.id = stats.game_id),
            is_playoff = (SELECT is_playoff FROM games WHERE games.id = stats.game_id)
        WHERE season IS NULL
      `).run();
      db.exec('CREATE INDEX IF NOT EXISTS idx_stats_season_playoff ON stats(season, is_playoff);');
    },
  },
  {
    version: 3,
    description: 'Add franchise_tagged flag to players',
    up: () => {
      const cols = (db.prepare('PRAGMA table_info(players)').all() as any[]).map((c: any) => c.name);
      if (!cols.includes('franchise_tagged'))
        db.prepare('ALTER TABLE players ADD COLUMN franchise_tagged INTEGER DEFAULT 0').run();
    },
  },
  {
    version: 4,
    description: 'Add dead_cap_entries table',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS dead_cap_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER NOT NULL,
          player_id INTEGER,
          player_name TEXT,
          position TEXT,
          season INTEGER NOT NULL,
          amount REAL NOT NULL
        )
      `);
    },
  },
  {
    version: 5,
    description: 'Add coaching_staff table',
    up: () => {
      db.exec(`
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
        )
      `);
    },
  },
  {
    version: 6,
    description: 'Add combine measurables to draft_prospects',
    up: () => {
      const cols = (db.prepare('PRAGMA table_info(draft_prospects)').all() as any[]).map((c: any) => c.name);
      if (!cols.includes('forty_time')) db.prepare('ALTER TABLE draft_prospects ADD COLUMN forty_time REAL').run();
      if (!cols.includes('bench_press')) db.prepare('ALTER TABLE draft_prospects ADD COLUMN bench_press INTEGER').run();
      if (!cols.includes('vertical_jump')) db.prepare('ALTER TABLE draft_prospects ADD COLUMN vertical_jump REAL').run();
      if (!cols.includes('broad_jump')) db.prepare('ALTER TABLE draft_prospects ADD COLUMN broad_jump INTEGER').run();
      if (!cols.includes('cone_time')) db.prepare('ALTER TABLE draft_prospects ADD COLUMN cone_time REAL').run();
    },
  },
  {
    version: 7,
    description: 'Add team_schemes table',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS team_schemes (
          team_id INTEGER PRIMARY KEY,
          offense_scheme TEXT NOT NULL DEFAULT 'West Coast',
          defense_scheme TEXT NOT NULL DEFAULT '4-3',
          FOREIGN KEY (team_id) REFERENCES teams(id)
        )
      `);
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
