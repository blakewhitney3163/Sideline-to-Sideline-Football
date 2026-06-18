import Database from 'better-sqlite3';
import path from 'path';

// ─── Open Database ────────────────────────────────────────────────────────────

export const db: Database.Database = new Database(path.join(process.cwd(), 'nfl-simulator.db'));

// ─── Base Schema ──────────────────────────────────────────────────────────────

db.exec(`
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
    FOREIGN KEY (home_team_id) REFERENCES teams(id),
    FOREIGN KEY (away_team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
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
    drafted_by_team_id INTEGER
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
`);

// ─── Indexes ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_stats_game_id    ON stats(game_id);
  CREATE INDEX IF NOT EXISTS idx_stats_player_id  ON stats(player_id);
  CREATE INDEX IF NOT EXISTS idx_stats_team_id    ON stats(team_id);
  CREATE INDEX IF NOT EXISTS idx_stats_team_game  ON stats(team_id, game_id);
  CREATE INDEX IF NOT EXISTS idx_games_season     ON games(season);
  CREATE INDEX IF NOT EXISTS idx_games_season_sim ON games(season, is_simulated);
`);

// ─── Player Column Migrations ─────────────────────────────────────────────────

const playerCols: any[] = db.prepare('PRAGMA table_info(players)').all() as any[];

if (!playerCols.find(c => c.name === 'position_label')) {
  db.prepare('ALTER TABLE players ADD COLUMN position_label TEXT').run();
}

if (!playerCols.find(c => c.name === 'dev_trait')) {
  db.prepare("ALTER TABLE players ADD COLUMN dev_trait TEXT DEFAULT 'Normal'").run();
  const allPlayers = db.prepare('SELECT id, overall_rating FROM players').all() as any[];
  const assignTrait = db.prepare('UPDATE players SET dev_trait = ? WHERE id = ?');
  const assignTraits = db.transaction(() => {
    for (const player of allPlayers) {
      const ovr: number = player.overall_rating;
      const rand = Math.random();
      let trait: string;
      if (ovr >= 90) {
        trait = rand < 0.40 ? 'X-Factor' : rand < 0.80 ? 'Superstar' : rand < 0.98 ? 'Star' : 'Normal';
      } else if (ovr >= 80) {
        trait = rand < 0.05 ? 'X-Factor' : rand < 0.30 ? 'Superstar' : rand < 0.75 ? 'Star' : 'Normal';
      } else if (ovr >= 70) {
        trait = rand < 0.01 ? 'X-Factor' : rand < 0.09 ? 'Superstar' : rand < 0.44 ? 'Star' : 'Normal';
      } else {
        trait = rand < 0.002 ? 'X-Factor' : rand < 0.022 ? 'Superstar' : rand < 0.202 ? 'Star' : 'Normal';
      }
      assignTrait.run(trait, player.id);
    }
  });
  assignTraits();
  console.log('Dev traits assigned to all players');
}

if (!playerCols.find(c => c.name === 'roster_status')) {
  db.prepare("ALTER TABLE players ADD COLUMN roster_status TEXT DEFAULT 'active'").run();
  db.prepare("UPDATE players SET roster_status = 'free_agent' WHERE is_free_agent = 1").run();
  db.prepare("UPDATE players SET roster_status = 'active' WHERE is_free_agent = 0 AND team_id IS NOT NULL").run();
  console.log('roster_status column added');
}

if (!playerCols.find(c => c.name === 'injury_status')) {
  db.prepare("ALTER TABLE players ADD COLUMN injury_status TEXT DEFAULT 'healthy'").run();
}

if (!playerCols.find(c => c.name === 'weeks_out')) {
  db.prepare('ALTER TABLE players ADD COLUMN weeks_out INTEGER DEFAULT 0').run();
}

if (!playerCols.find(c => c.name === 'injury_type')) {
  db.prepare('ALTER TABLE players ADD COLUMN injury_type TEXT').run();
}

if (!playerCols.find(c => c.name === 'waived_by_team_id')) {
  db.prepare('ALTER TABLE players ADD COLUMN waived_by_team_id INTEGER').run();
}

if (!playerCols.find(c => c.name === 'waiver_placed_week')) {
  db.prepare('ALTER TABLE players ADD COLUMN waiver_placed_week INTEGER').run();
}

// ─── Player Attribute Column Migrations ───────────────────────────────────────
// Raw Madden CSV columns + derived UI columns — all auto-migrated
const maddenCols = [
  // Raw Madden attributes (exact CSV column names)
  'agility', 'acceleration', 'stamina', 'toughness', 'injury', 'jumping', 'trucking',
  'changeofdirection', 'playrecognition', 'throwpower', 'throwaccuracyshort',
  'throwaccuracymid', 'throwaccuracydeep', 'playaction', 'throwonrun', 'carrying',
  'ballcarriervision', 'stiffarm', 'spinmove', 'jukemove', 'catching',
  'shortrouterunning', 'midrouterunning', 'deeprouterunning', 'spectacularcatch',
  'catchintraffic', 'release', 'runblocking', 'passblocking', 'impactblocking',
  'mancoverage', 'zonecoverage', 'tackle', 'hitpower', 'press', 'pursuit',
  'kickaccuracy', 'kickpower', 'kick_return', 'jerseynumber', 'yearspro',
  // Derived / UI-facing columns
  'throw_accuracy', 'throw_power', 'route_running', 'tackle_rating',
  'coverage', 'pass_rush', 'kick_power', 'kick_accuracy',
];
for (const col of maddenCols) {
  if (!playerCols.find((c: any) => c.name === col)) {
    db.prepare(`ALTER TABLE players ADD COLUMN ${col} INTEGER DEFAULT 0`).run();
    console.log(`Players: added ${col}`);
  }
}

// ─── Stats Column Migrations ──────────────────────────────────────────────────

const statCols: any[] = db.prepare('PRAGMA table_info(stats)').all() as any[];
const statMigrations: [string, string][] = [
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
  if (!statCols.find(c => c.name === col)) {
    db.prepare(`ALTER TABLE stats ADD COLUMN ${col} ${type}`).run();
    console.log(`Stats: added ${col}`);
  }
}

// ─── Games Column Migrations ──────────────────────────────────────────────────

const gameCols: any[] = db.prepare('PRAGMA table_info(games)').all() as any[];
const gameColMigrations: [string, string][] = [
  ['home_q1', 'INTEGER DEFAULT 0'],
  ['home_q2', 'INTEGER DEFAULT 0'],
  ['home_q3', 'INTEGER DEFAULT 0'],
  ['home_q4', 'INTEGER DEFAULT 0'],
  ['away_q1', 'INTEGER DEFAULT 0'],
  ['away_q2', 'INTEGER DEFAULT 0'],
  ['away_q3', 'INTEGER DEFAULT 0'],
  ['away_q4', 'INTEGER DEFAULT 0'],
  ['weather', 'TEXT'],
];
for (const [col, type] of gameColMigrations) {
  if (!gameCols.find(c => c.name === col)) {
    db.prepare(`ALTER TABLE games ADD COLUMN ${col} ${type}`).run();
    console.log(`Games: added ${col}`);
  }
}

// ─── Contract Column Migrations ───────────────────────────────────────────────

const contractCols: any[] = db.prepare('PRAGMA table_info(contracts)').all() as any[];

if (!contractCols.find(c => c.name === 'guaranteed_amount')) {
  db.prepare('ALTER TABLE contracts ADD COLUMN guaranteed_amount REAL DEFAULT 0').run();
  console.log('Contracts: added guaranteed_amount');
}
if (!contractCols.find(c => c.name === 'guaranteed_pct')) {
  db.prepare('ALTER TABLE contracts ADD COLUMN guaranteed_pct REAL DEFAULT 0').run();
  console.log('Contracts: added guaranteed_pct');
}

// ─── Draft Prospects Column Migrations ────────────────────────────────────────

const prospectCols: any[] = db.prepare('PRAGMA table_info(draft_prospects)').all() as any[];
if (!prospectCols.find(c => c.name === 'scouted')) {
  db.prepare('ALTER TABLE draft_prospects ADD COLUMN scouted INTEGER DEFAULT 0').run();
  console.log('Draft prospects: added scouted');
}

// ─── Roster Trimming ──────────────────────────────────────────────────────────

const ACTIVE_LIMIT = 53;
const PS_LIMIT = 16;

const oversizedTeams = db.prepare(
  "SELECT team_id, COUNT(*) as cnt FROM players WHERE roster_status = 'active' AND team_id IS NOT NULL GROUP BY team_id HAVING cnt > 53"
).all() as any[];

if (oversizedTeams.length > 0) {
  const teamsForTrim = db.prepare('SELECT id FROM teams').all() as any[];
  const trimRosters = db.transaction(() => {
    for (const team of teamsForTrim) {
      const activePlayers = db.prepare(
        "SELECT id FROM players WHERE team_id = ? AND roster_status = 'active' ORDER BY overall_rating DESC"
      ).all(team.id) as any[];
      if (activePlayers.length > ACTIVE_LIMIT) {
        const excess = activePlayers.slice(ACTIVE_LIMIT);
        const psSlots = Math.min(excess.length, PS_LIMIT);
        for (let i = 0; i < excess.length; i++) {
          if (i < psSlots) {
            db.prepare("UPDATE players SET roster_status = 'practice_squad' WHERE id = ?").run(excess[i].id);
          } else {
            db.prepare("UPDATE players SET roster_status = 'free_agent', team_id = NULL, is_free_agent = 1 WHERE id = ?").run(excess[i].id);
          }
        }
      }
    }
  });
  trimRosters();
  console.log(`Rosters trimmed for ${oversizedTeams.length} teams`);
}

// ─── Contract Generation ──────────────────────────────────────────────────────

const SAL_RANGES: Record<string, [number, number]> = {
  QB: [1.0, 42], WR: [1.0, 28], DL: [1.0, 32], LB: [1.0, 18],
  CB: [1.0, 22], TE: [1.0, 16], OL: [1.0, 22], S: [1.0, 18],
  RB: [1.0, 16], K: [1.0, 4],
};

const TRAIT_PREMIUM: Record<string, number> = {
  Normal: 1.0, Star: 1.15, Superstar: 1.3, 'X-Factor': 1.5,
};

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

  const gen = db.transaction(() => {
    for (const p of activePlayers) {
      const [minSal, maxSal] = SAL_RANGES[p.position] ?? [1.0, 15];
      const ovrFactor = Math.pow(Math.max(0, (p.overall_rating - 70)) / 29, 2.5);
      let salary = minSal + ovrFactor * (maxSal - minSal);
      salary *= (TRAIT_PREMIUM[p.dev_trait] ?? 1.0);
      salary = Math.round(salary * 10) / 10;

      const yearsTotal =
        p.age <= 24 ? (Math.random() < 0.5 ? 5 : 4) :
        p.age <= 27 ? (Math.random() < 0.4 ? 5 : Math.random() < 0.6 ? 4 : 3) :
        p.age <= 30 ? (Math.random() < 0.4 ? 4 : Math.random() < 0.6 ? 3 : 2) :
        p.age <= 33 ? (Math.random() < 0.4 ? 3 : Math.random() < 0.5 ? 2 : 1) :
        (Math.random() < 0.3 ? 2 : 1);

      const yearsRemaining = Math.floor(Math.random() * yearsTotal) + 1;
      const [gMin, gMax] = TRAIT_GUARANTEE[p.dev_trait] ?? [10, 35];
      const guaranteedPct = Math.round(gMin + Math.random() * (gMax - gMin));
      const guaranteedAmount = Math.round(salary * yearsTotal * (guaranteedPct / 100) * 10) / 10;

      insertContract.run(p.id, p.team_id, yearsTotal, yearsRemaining, salary, guaranteedAmount, guaranteedPct);
    }
    for (const p of psPlayers) {
      insertContract.run(p.id, p.team_id, 1, 1, 1.165, 0, 0);
    }
  });

  gen();
  console.log(`Contracts generated: ${activePlayers.length} active + ${psPlayers.length} PS`);
}

// ─── Bootstrap Defaults ───────────────────────────────────────────────────────

const contractCount = (db.prepare('SELECT COUNT(*) as count FROM contracts').get() as any).count;
if (contractCount === 0) generateContracts();

if (!db.prepare("SELECT value FROM settings WHERE key = 'current_season'").get()) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('current_season', '2025')").run();
}

// ─── Migration Versioning ─────────────────────────────────────────────────────
//
// All schema changes going forward must be added as a numbered migration here.
// Do NOT use ad-hoc ALTER TABLE checks outside this block for new columns.
//
// Existing PRAGMA-based migrations above remain for backward compatibility
// with pre-versioning saves. They are all idempotent (no-ops on current saves).
// The version runner stamps new and existing DBs at CURRENT_SCHEMA_VERSION
// so future migrations only run once per DB file.

const CURRENT_SCHEMA_VERSION = 1;

interface Migration {
  version: number;
  description: string;
  up: () => void;
}

const MIGRATIONS: Migration[] = [
  // Version 1 = baseline: all existing PRAGMA migrations above + indexes + player_milestones
  // Add future migrations below as { version: 2, description: '...', up: () => { ... } }
];

function getSchemaVersion(): number {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get() as any;
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(version: number): void {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)").run(String(version));
}

export function runMigrations(): void {
  const currentVersion = getSchemaVersion();

  if (currentVersion === 0) {
    // Pre-versioning DB or brand-new DB — all existing PRAGMA migrations already applied above.
    // Stamp at baseline so future migrations know where to start.
    setSchemaVersion(CURRENT_SCHEMA_VERSION);
    console.log(`Schema stamped at v${CURRENT_SCHEMA_VERSION} (baseline)`);
    return;
  }

  const pending = MIGRATIONS
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    console.log(`Schema up to date (v${currentVersion})`);
    return;
  }

  for (const migration of pending) {
    try {
      db.transaction(() => migration.up())();
      setSchemaVersion(migration.version);
      console.log(`Migration v${migration.version} applied: ${migration.description}`);
    } catch (err) {
      console.error(`Migration v${migration.version} FAILED — rolling back:`, err);
      throw err;
    }
  }

  console.log(`Schema migrated to v${CURRENT_SCHEMA_VERSION}`);
}

runMigrations();
