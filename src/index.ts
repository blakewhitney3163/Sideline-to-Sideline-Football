import { app, BrowserWindow } from 'electron';
const { db, generateContracts } = require('./database');
const { importFromMadden } = require('./importfromMadden');
import { getCurrentSeason } from './helpers/getCurrentSeason';
import { balanceRosters } from './helpers/balanceRosters';
import { registerSettingsHandlers } from './handlers/settingsHandlers';
import { registerTradeHandlers } from './handlers/tradeHandlers';
import { registerSimHandlers } from './handlers/simHandlers';
import { registerContractHandlers } from './handlers/contractHandlers';
import { registerDraftHandlers } from './handlers/draftHandlers';
import { registerStatsHandlers } from './handlers/statsHandlers';
import { registerSeasonHandlers } from './handlers/seasonHandlers';

// Auto-seed teams if fresh DB
const teamCount = (db.prepare('SELECT COUNT(*) as cnt FROM teams').get() as any).cnt;
if (teamCount === 0) {
  const insertTeam = db.prepare(
    'INSERT INTO teams (city, name, abbreviation, conference, division) VALUES (?, ?, ?, ?, ?)'
  );
  const NFL_TEAMS = [
    ['Baltimore', 'Ravens', 'BAL', 'AFC', 'North'],
    ['Cincinnati', 'Bengals', 'CIN', 'AFC', 'North'],
    ['Cleveland', 'Browns', 'CLE', 'AFC', 'North'],
    ['Pittsburgh', 'Steelers', 'PIT', 'AFC', 'North'],
    ['Houston', 'Texans', 'HOU', 'AFC', 'South'],
    ['Indianapolis', 'Colts', 'IND', 'AFC', 'South'],
    ['Jacksonville', 'Jaguars', 'JAX', 'AFC', 'South'],
    ['Tennessee', 'Titans', 'TEN', 'AFC', 'South'],
    ['Buffalo', 'Bills', 'BUF', 'AFC', 'East'],
    ['Miami', 'Dolphins', 'MIA', 'AFC', 'East'],
    ['New England', 'Patriots', 'NE', 'AFC', 'East'],
    ['New York', 'Jets', 'NYJ', 'AFC', 'East'],
    ['Denver', 'Broncos', 'DEN', 'AFC', 'West'],
    ['Kansas City', 'Chiefs', 'KC', 'AFC', 'West'],
    ['Las Vegas', 'Raiders', 'LV', 'AFC', 'West'],
    ['Los Angeles', 'Chargers', 'LAC', 'AFC', 'West'],
    ['Chicago', 'Bears', 'CHI', 'NFC', 'North'],
    ['Detroit', 'Lions', 'DET', 'NFC', 'North'],
    ['Green Bay', 'Packers', 'GB', 'NFC', 'North'],
    ['Minnesota', 'Vikings', 'MIN', 'NFC', 'North'],
    ['Atlanta', 'Falcons', 'ATL', 'NFC', 'South'],
    ['Carolina', 'Panthers', 'CAR', 'NFC', 'South'],
    ['New Orleans', 'Saints', 'NO', 'NFC', 'South'],
    ['Tampa Bay', 'Buccaneers', 'TB', 'NFC', 'South'],
    ['Dallas', 'Cowboys', 'DAL', 'NFC', 'East'],
    ['New York', 'Giants', 'NYG', 'NFC', 'East'],
    ['Philadelphia', 'Eagles', 'PHI', 'NFC', 'East'],
    ['Washington', 'Commanders', 'WAS', 'NFC', 'East'],
    ['Arizona', 'Cardinals', 'ARI', 'NFC', 'West'],
    ['Los Angeles', 'Rams', 'LAR', 'NFC', 'West'],
    ['San Francisco', '49ers', 'SF', 'NFC', 'West'],
    ['Seattle', 'Seahawks', 'SEA', 'NFC', 'West'],
  ];
  db.transaction(() => {
    for (const [city, name, abbr, conf, div] of NFL_TEAMS) {
      insertTeam.run(city, name, abbr, conf, div);
    }
  })();
  console.log('32 NFL teams seeded');

  const pathModule = require('path');
  const csvPath = pathModule.join(app.getAppPath(), 'src', 'madden-ratings.csv');
  importFromMadden(csvPath);
  generateContracts();
  console.log('Fresh DB: players and contracts generated');
}
db.exec(`
  CREATE TABLE IF NOT EXISTS historical_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_type TEXT NOT NULL,
    category TEXT NOT NULL,
    rank INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    team_display TEXT,
    position TEXT,
    season INTEGER,
    games_played INTEGER DEFAULT 0,
    pass_yards INTEGER DEFAULT 0, pass_tds INTEGER DEFAULT 0, interceptions INTEGER DEFAULT 0,
    completions INTEGER DEFAULT 0, pass_attempts INTEGER DEFAULT 0,
    rush_yards INTEGER DEFAULT 0, rush_tds INTEGER DEFAULT 0, rush_attempts INTEGER DEFAULT 0,
    rec_yards INTEGER DEFAULT 0, rec_tds INTEGER DEFAULT 0, receptions INTEGER DEFAULT 0,
    tackles INTEGER DEFAULT 0, assisted_tackles INTEGER DEFAULT 0,
    sacks REAL DEFAULT 0, def_interceptions INTEGER DEFAULT 0,
    pass_deflections INTEGER DEFAULT 0, forced_fumbles INTEGER DEFAULT 0
  )
`);
const histCount = (db.prepare('SELECT COUNT(*) as cnt FROM historical_records').get() as any).cnt;
const hasPassTds = histCount > 0
  ? (db.prepare("SELECT COUNT(*) as cnt FROM historical_records WHERE category = 'passTds'").get() as any).cnt > 0
  : false;
if (histCount === 0 || !hasPassTds) {
  db.prepare('DELETE FROM historical_records').run();
  const pathModule = require('path');
  const fs = require('fs');
  const parseHistoricalCSV = (filePath: string, recordType: string) => {
    if (!fs.existsSync(filePath)) { console.error('Missing:', filePath); return; }
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((l: string) => l.trim());
    const headers = lines[0].split(',').map((h: string) => h.trim());
    const insert = db.prepare(`
      INSERT INTO historical_records
      (record_type, category, rank, player_name, team_display, position, season, games_played,
       pass_yards, pass_tds, interceptions, completions, pass_attempts,
       rush_yards, rush_tds, rush_attempts, rec_yards, rec_tds, receptions,
       tackles, assisted_tackles, sacks, def_interceptions, pass_deflections, forced_fumbles)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const run = db.transaction(() => {
      for (const line of lines.slice(1)) {
        const v = line.split(',');
        const r: any = {};
        headers.forEach((h: string, i: number) => r[h] = v[i]?.trim() ?? '');
        insert.run(
          recordType, r.category, parseInt(r.rank) || 0, r.player_name, r.team_display, r.position,
          r.season ? parseInt(r.season) : null, parseInt(r.games_played) || 0,
          parseInt(r.pass_yards) || 0, parseInt(r.pass_tds) || 0, parseInt(r.interceptions) || 0,
          parseInt(r.completions) || 0, parseInt(r.pass_attempts) || 0,
          parseInt(r.rush_yards) || 0, parseInt(r.rush_tds) || 0, parseInt(r.rush_attempts) || 0,
          parseInt(r.rec_yards) || 0, parseInt(r.rec_tds) || 0, parseInt(r.receptions) || 0,
          parseInt(r.tackles) || 0, parseInt(r.assisted_tackles) || 0,
          parseFloat(r.sacks) || 0, parseInt(r.def_interceptions) || 0,
          parseInt(r.pass_deflections) || 0, parseInt(r.forced_fumbles) || 0
        );
      }
    });
    run();
    console.log(`Historical records seeded: ${recordType}`);
  };
  const dataDir = pathModule.join(app.getAppPath(), 'src', 'data');
  parseHistoricalCSV(pathModule.join(dataDir, 'nfl-alltime-records.csv'), 'alltime');
  parseHistoricalCSV(pathModule.join(dataDir, 'nfl-season-records.csv'), 'season');
}

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// ─── Depth Chart Table ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS depth_chart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    position_group TEXT NOT NULL,
    slot INTEGER NOT NULL,
    UNIQUE(team_id, player_id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (player_id) REFERENCES players(id)
  )
`);

db.exec(`
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
    UNIQUE(player_id, season)
  )
`);

// Migrate career_stats_history to include defensive stat columns
['tackles','assisted_tackles','forced_fumbles','fumble_recoveries',
 'def_interceptions','pass_deflections','def_tds'].forEach(col => {
  try { db.exec(`ALTER TABLE career_stats_history ADD COLUMN ${col} INTEGER DEFAULT 0`); } catch (_) {}
});
try { db.exec(`ALTER TABLE career_stats_history ADD COLUMN sacks REAL DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE career_stats_history ADD COLUMN tfl REAL DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE players ADD COLUMN waived_by_team_id INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE players ADD COLUMN waived_by_team_id INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE players ADD COLUMN waiver_placed_week INTEGER DEFAULT NULL`); } catch (_) {}
try { db.exec(`ALTER TABLE draft_prospects ADD COLUMN scouted INTEGER DEFAULT 0`); } catch (_) {}
db.exec(`
  CREATE TABLE IF NOT EXISTS pick_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_team_id INTEGER NOT NULL,
    original_team_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    round INTEGER NOT NULL,
    is_used INTEGER DEFAULT 0,
    UNIQUE(original_team_id, season, round)
  )
`);

try { db.exec(`CREATE TABLE IF NOT EXISTS team_trade_overrides (
  team_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL
)`); } catch (_) {}

try { db.exec(`CREATE TABLE IF NOT EXISTS hall_of_fame (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL, position TEXT NOT NULL,
  inducted_season INTEGER NOT NULL,
  dev_trait TEXT DEFAULT 'Normal', peak_ovr INTEGER DEFAULT 70,
  career_games INTEGER DEFAULT 0,
  career_pass_yards INTEGER DEFAULT 0, career_pass_tds INTEGER DEFAULT 0,
  career_rush_yards INTEGER DEFAULT 0, career_rush_tds INTEGER DEFAULT 0,
  career_rec_yards INTEGER DEFAULT 0, career_rec_tds INTEGER DEFAULT 0,
  career_receptions INTEGER DEFAULT 0,
  career_tackles INTEGER DEFAULT 0, career_sacks REAL DEFAULT 0,
  career_def_ints INTEGER DEFAULT 0, career_pass_deflections INTEGER DEFAULT 0
)`); } catch (_) {}

try { db.exec(`ALTER TABLE games ADD COLUMN home_q1 INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE games ADD COLUMN home_q2 INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE games ADD COLUMN home_q3 INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE games ADD COLUMN home_q4 INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE games ADD COLUMN away_q1 INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE games ADD COLUMN away_q2 INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE games ADD COLUMN away_q3 INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE games ADD COLUMN away_q4 INTEGER DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE games ADD COLUMN weather TEXT DEFAULT 'clear'`); } catch (_) {}

// Auto-balance rosters on startup if FA pool is empty
{
  const faCount = (db.prepare('SELECT COUNT(*) as count FROM players WHERE is_free_agent = 1').get() as any).count;
  if (faCount === 0) balanceRosters();
}

function initPickAssets(): void {
  const season = getCurrentSeason();
  const teams = db.prepare('SELECT id FROM teams').all() as any[];
  const insert = db.prepare('INSERT OR IGNORE INTO pick_assets (owner_team_id, original_team_id, season, round) VALUES (?, ?, ?, ?)');
  const run = db.transaction(() => {
    for (const team of teams) {
      for (let s = season; s <= season + 1; s++) {
        for (let r = 1; r <= 7; r++) {
          insert.run(team.id, team.id, s, r);
        }
      }
    }
  });
  run();
}
initPickAssets();

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    height: 700,
    width: 1200,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.webContents.openDevTools();
};

// ─── App Lifecycle ────────────────────────────────────────────────────────────

registerSettingsHandlers();
registerTradeHandlers();
registerSimHandlers();
registerContractHandlers();
registerDraftHandlers();
registerStatsHandlers();
registerSeasonHandlers();

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
