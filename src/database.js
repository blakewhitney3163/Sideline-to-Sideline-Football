const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(process.cwd(), 'nfl-simulator.db'));

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
`);

// ─── Player Column Migrations ─────────────────────────────────────────────────

const playerCols = db.prepare("PRAGMA table_info(players)").all();

if (!playerCols.find(c => c.name === 'position_label')) {
  db.prepare('ALTER TABLE players ADD COLUMN position_label TEXT').run();
}

if (!playerCols.find(c => c.name === 'dev_trait')) {
  db.prepare("ALTER TABLE players ADD COLUMN dev_trait TEXT DEFAULT 'Normal'").run();

  const allPlayers = db.prepare('SELECT id, overall_rating FROM players').all();
  const assignTrait = db.prepare("UPDATE players SET dev_trait = ? WHERE id = ?");

  const assignTraits = db.transaction(() => {
    for (const player of allPlayers) {
      const ovr = player.overall_rating;
      const rand = Math.random();
      let trait;
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

// ─── Contract Column Migrations ───────────────────────────────────────────────

const contractCols = db.prepare("PRAGMA table_info(contracts)").all();

if (!contractCols.find(c => c.name === 'guaranteed_amount')) {
  db.prepare('ALTER TABLE contracts ADD COLUMN guaranteed_amount REAL DEFAULT 0').run();
  console.log('Contracts: added guaranteed_amount column');
}
if (!contractCols.find(c => c.name === 'guaranteed_pct')) {
  db.prepare('ALTER TABLE contracts ADD COLUMN guaranteed_pct REAL DEFAULT 0').run();
  console.log('Contracts: added guaranteed_pct column');
}

// ─── Roster Trimming ──────────────────────────────────────────────────────────
// Ensures each team has at most 53 active + 16 practice squad players.
// Extras are released to free agency. Runs once on startup if teams have
// more than 53 active players (e.g. after initial data load).

const ACTIVE_LIMIT = 53;
const PS_LIMIT = 16;

const teamsForTrim = db.prepare('SELECT id FROM teams').all();
const trimRosters = db.transaction(() => {
  for (const team of teamsForTrim) {
    const activePlayers = db.prepare(
      "SELECT id FROM players WHERE team_id = ? AND roster_status = 'active' ORDER BY overall_rating DESC"
    ).all(team.id);

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

const oversizedTeams = db.prepare(
  "SELECT team_id, COUNT(*) as cnt FROM players WHERE roster_status = 'active' AND team_id IS NOT NULL GROUP BY team_id HAVING cnt > 53"
).all();
if (oversizedTeams.length > 0) {
  trimRosters();
  console.log(`Rosters trimmed for ${oversizedTeams.length} teams`);
}

// ─── Contract Generation ──────────────────────────────────────────────────────

// Salary max values = elite-tier annual (M). X-Factor multiplier pushes tops to:
//   QB X-Factor OVR99: ~$63M  |  WR X-Factor OVR99: ~$42M  |  DL X-Factor OVR99: ~$48M
const SAL_RANGES = {
  QB:  [1.0, 42],
  WR:  [1.0, 28],
  DL:  [1.0, 32],
  LB:  [1.0, 18],
  CB:  [1.0, 22],
  TE:  [1.0, 16],
  OL:  [1.0, 22],
  S:   [1.0, 18],
  RB:  [1.0, 16],
  K:   [1.0,  4],
};

const TRAIT_PREMIUM   = { Normal: 1.0, Star: 1.15, Superstar: 1.3, 'X-Factor': 1.5 };
const TRAIT_GUARANTEE = { Normal: [10, 35], Star: [25, 50], Superstar: [40, 65], 'X-Factor': [55, 85] };

function generateContracts() {
  db.prepare('DELETE FROM contracts').run();

  const activePlayers = db.prepare(
    "SELECT id, overall_rating, age, position, dev_trait, team_id FROM players WHERE team_id IS NOT NULL AND roster_status = 'active'"
  ).all();

  const psPlayers = db.prepare(
    "SELECT id, team_id FROM players WHERE team_id IS NOT NULL AND roster_status = 'practice_squad'"
  ).all();

  const insertContract = db.prepare(`
    INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const gen = db.transaction(() => {
    for (const p of activePlayers) {
      const [minSal, maxSal] = SAL_RANGES[p.position] ?? [1.0, 15];

      // Cubic OVR curve with 70-floor — keeps backups on near-minimum deals,
      // pushes elite players toward realistic top-market salaries.
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
  console.log(`Contracts: ${activePlayers.length} active + ${psPlayers.length} PS`);
}

// Run on startup only if contracts table is empty
const contractCount = db.prepare('SELECT COUNT(*) as count FROM contracts').get().count;
if (contractCount === 0) generateContracts();

// ─── Settings Defaults ────────────────────────────────────────────────────────

if (!db.prepare("SELECT value FROM settings WHERE key = 'current_season'").get()) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('current_season', '2025')").run();
}

console.log('Database ready');
module.exports = { db, generateContracts };