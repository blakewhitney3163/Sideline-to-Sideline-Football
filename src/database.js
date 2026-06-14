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

// ─── Contract Column Migrations ───────────────────────────────────────────────

const contractCols = db.prepare("PRAGMA table_info(contracts)").all();

if (!contractCols.find(c => c.name === 'guaranteed_amount')) {
  db.prepare('ALTER TABLE contracts ADD COLUMN guaranteed_amount REAL DEFAULT 0').run();
}
if (!contractCols.find(c => c.name === 'guaranteed_pct')) {
  db.prepare('ALTER TABLE contracts ADD COLUMN guaranteed_pct REAL DEFAULT 0').run();
}

// ─── Contract Generation ──────────────────────────────────────────────────────
// Runs only when the contracts table is empty (fresh start or after reset-dynasty).

const contractCount = (db.prepare('SELECT COUNT(*) as count FROM contracts').get()).count;

if (contractCount === 0) {
  const players = db.prepare(
    'SELECT id, overall_rating, age, position, dev_trait, team_id FROM players WHERE team_id IS NOT NULL AND is_free_agent = 0'
  ).all();

  const insertContract = db.prepare(`
    INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Salary ceilings ($ millions/yr). X-Factor trait adds 1.5x multiplier:
  //   QB X-Factor OVR99 ≈ $63M | WR ≈ $42M | DL ≈ $48M
  const salaryRanges = {
    QB:  [0.9, 42],
    WR:  [0.9, 28],
    DL:  [0.9, 32],
    LB:  [0.9, 18],
    CB:  [0.9, 22],
    TE:  [0.9, 16],
    OL:  [0.9, 22],
    S:   [0.9, 18],
    RB:  [0.9, 16],
    K:   [0.9,  4],
  };

  const traitPremium   = { Normal: 1.0, Star: 1.15, Superstar: 1.3, 'X-Factor': 1.5 };
  // Guaranteed % range per trait — higher stars get more security
  const traitGuarantee = { Normal: [10, 35], Star: [25, 50], Superstar: [40, 65], 'X-Factor': [55, 85] };

  const generateContracts = db.transaction(() => {
    for (const player of players) {
      const [minSal, maxSal] = salaryRanges[player.position] ?? [0.9, 15];

      // Quadratic OVR curve: only elite OVRs get elite money
      const ovrFactor = Math.pow(Math.max(0, (player.overall_rating - 50)) / 49, 2);
      let salary = minSal + ovrFactor * (maxSal - minSal);
      salary *= (traitPremium[player.dev_trait] ?? 1.0);
      salary = Math.round(salary * 10) / 10;

      // Contract length by age tier
      const yearsTotal =
        player.age <= 24 ? (Math.random() < 0.5 ? 5 : 4) :
        player.age <= 27 ? (Math.random() < 0.4 ? 5 : Math.random() < 0.6 ? 4 : 3) :
        player.age <= 30 ? (Math.random() < 0.4 ? 4 : Math.random() < 0.6 ? 3 : 2) :
        player.age <= 33 ? (Math.random() < 0.4 ? 3 : Math.random() < 0.5 ? 2 : 1) :
        (Math.random() < 0.3 ? 2 : 1);

      // Uniform spread across contract so not everyone expires at once
      const yearsRemaining = Math.floor(Math.random() * yearsTotal) + 1;

      // Guarantee % tied to trait (higher trait = better job security)
      const [gMin, gMax] = traitGuarantee[player.dev_trait] ?? [10, 35];
      const guaranteedPct = Math.round(gMin + Math.random() * (gMax - gMin));
      const guaranteedAmount = Math.round(salary * yearsTotal * (guaranteedPct / 100) * 10) / 10;

      insertContract.run(player.id, player.team_id, yearsTotal, yearsRemaining, salary, guaranteedAmount, guaranteedPct);
    }
  });
  generateContracts();
  console.log(`Contracts generated for ${players.length} players`);
}

// ─── Settings Defaults ────────────────────────────────────────────────────────

const existingSeason = db.prepare("SELECT value FROM settings WHERE key = 'current_season'").get();
if (!existingSeason) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('current_season', '2025')").run();
}

console.log('Database ready');
module.exports = db;