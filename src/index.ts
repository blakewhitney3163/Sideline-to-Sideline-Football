import { app, BrowserWindow } from 'electron';
import path from 'path';
import { db, generateContracts, isDatabaseInitialized } from './database';
import { registerSaveHandlers, setActiveSaveName } from './handlers/saveHandlers';
import { registerSettingsHandlers } from './handlers/settingsHandlers';
import { registerTradeHandlers } from './handlers/tradeHandlers';
import { registerSimHandlers } from './handlers/simHandlers';
import { registerContractHandlers } from './handlers/contractHandlers';
import { registerDraftHandlers } from './handlers/draftHandlers';
import { registerStatsHandlers } from './handlers/statsHandlers';
import { registerSeasonHandlers } from './handlers/seasonHandlers';
import { registerNewsHandlers } from './handlers/newsHandlers';
import { getCurrentSeason } from './helpers/getCurrentSeason';
import { balanceRosters } from './helpers/balanceRosters';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// ─── Bootstrap ───────────────────────────────────────────────────────────────
// Called after initDatabase() so the DB proxy is live.

function bootstrapDatabase(isNew: boolean): void {
  // Seed 32 teams on a brand-new save file
  const teamCount = (db.prepare('SELECT COUNT(*) as cnt FROM teams').get() as any).cnt;
  if (teamCount === 0) {
    const insertTeam = db.prepare(
      'INSERT INTO teams (city, name, abbreviation, conference, division) VALUES (?, ?, ?, ?, ?)'
    );
    const TEAMS = [
  // AFC North
  ['Baltimore',    'Rooks',        'ROK', 'AFC', 'North'],
  ['Cincinnati',   'Strikers',     'STK', 'AFC', 'North'],
  ['Cleveland',    'Forge',        'FOR', 'AFC', 'North'],
  ['Pittsburgh',   'Iron',         'IRN', 'AFC', 'North'],
  // AFC South
  ['Houston',      'Storm',        'STM', 'AFC', 'South'],
  ['Indianapolis', 'Cavalry',      'CAV', 'AFC', 'South'],
  ['Jacksonville', 'Surge',        'SRG', 'AFC', 'South'],
  ['Tennessee',    'Thunder',      'THD', 'AFC', 'South'],
  // AFC East
  ['Buffalo',      'Blizzard',     'BLZ', 'AFC', 'East'],
  ['Miami',        'Wave',         'WAV', 'AFC', 'East'],
  ['New England',  'Legion',       'LEG', 'AFC', 'East'],
  ['New York',     'Rush',         'NYR', 'AFC', 'East'],
  // AFC West
  ['Denver',       'Peaks',        'DPK', 'AFC', 'West'],
  ['Kansas City',  'Kings',        'KCK', 'AFC', 'West'],
  ['Las Vegas',    'Outlaws',      'LVO', 'AFC', 'West'],
  ['Los Angeles',  'Bolt',         'LAB', 'AFC', 'West'],
  // NFC North
  ['Chicago',      'Wolves',       'CHW', 'NFC', 'North'],
  ['Detroit',      'Motors',       'DTM', 'NFC', 'North'],
  ['Green Bay',    'Tundra',       'GBT', 'NFC', 'North'],
  ['Minnesota',    'Frost',        'MNF', 'NFC', 'North'],
  // NFC South
  ['Atlanta',      'Phoenix',      'ATX', 'NFC', 'South'],
  ['Carolina',     'Cougars',      'CAC', 'NFC', 'South'],
  ['New Orleans',  'Crescent',     'NOC', 'NFC', 'South'],
  ['Tampa Bay',    'Corsairs',     'TBC', 'NFC', 'South'],
  // NFC East
  ['Dallas',       'Mustangs',     'DAM', 'NFC', 'East'],
  ['New York',     'Empire',       'NYE', 'NFC', 'East'],
  ['Philadelphia', 'Liberty',      'PHL', 'NFC', 'East'],
  ['Washington',   'Capitol',      'WAC', 'NFC', 'East'],
  // NFC West
  ['Arizona',      'Desert Hawks', 'AZH', 'NFC', 'West'],
  ['Los Angeles',  'Pride',        'LAP', 'NFC', 'West'],
  ['San Francisco','Miners',       'SFM', 'NFC', 'West'],
  ['Seattle',      'Cascade',      'SEC', 'NFC', 'West'],
];

db.transaction(() => { for (const t of TEAMS) insertTeam.run(...t); })();
    console.log('32 teams seeded');

    const { importFromMadden } = require('./importfromMadden');
    const csvPath = path.join(app.getAppPath(), 'src', 'madden-ratings.csv');
    importFromMadden(csvPath);
    generateContracts();
    console.log('Fresh DB: players and contracts generated');
  }

  // Seed historical records if missing
  const histCount = (db.prepare('SELECT COUNT(*) as cnt FROM historical_records').get() as any).cnt;
  const hasPassTds = histCount > 0
    ? (db.prepare("SELECT COUNT(*) as cnt FROM historical_records WHERE category = 'passTds'").get() as any).cnt > 0
    : false;
  if (histCount === 0 || !hasPassTds) {
    db.prepare('DELETE FROM historical_records').run();
    const fs = require('fs');
    const insert = db.prepare(`
      INSERT INTO historical_records
        (record_type, category, rank, player_name, team_display, position, season, games_played,
         pass_yards, pass_tds, interceptions, completions, pass_attempts,
         rush_yards, rush_tds, rush_attempts, rec_yards, rec_tds, receptions,
         tackles, assisted_tackles, sacks, def_interceptions, pass_deflections, forced_fumbles)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const parseCSV = (filePath: string, recordType: string) => {
      if (!fs.existsSync(filePath)) { console.error('Missing:', filePath); return; }
      const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((l: string) => l.trim());
      const headers = lines[0].split(',').map((h: string) => h.trim());
      db.transaction(() => {
        for (const line of lines.slice(1)) {
          const v = line.split(',');
          const r: any = {};
          headers.forEach((h: string, i: number) => r[h] = v[i]?.trim() ?? '');
          insert.run(
            recordType, r.category, parseInt(r.rank) || 0, r.player_name, r.team_display, r.position,
            r.season ? parseInt(r.season) : null, parseInt(r.games_played) || 0,
            parseInt(r.pass_yards)||0, parseInt(r.pass_tds)||0, parseInt(r.interceptions)||0,
            parseInt(r.completions)||0, parseInt(r.pass_attempts)||0,
            parseInt(r.rush_yards)||0, parseInt(r.rush_tds)||0, parseInt(r.rush_attempts)||0,
            parseInt(r.rec_yards)||0, parseInt(r.rec_tds)||0, parseInt(r.receptions)||0,
            parseInt(r.tackles)||0, parseInt(r.assisted_tackles)||0,
            parseFloat(r.sacks)||0, parseInt(r.def_interceptions)||0,
            parseInt(r.pass_deflections)||0, parseInt(r.forced_fumbles)||0
          );
        }
      })();
    };
    const dataDir = path.join(app.getAppPath(), 'src', 'data');
    parseCSV(path.join(dataDir, 'nfl-alltime-records.csv'), 'alltime');
    parseCSV(path.join(dataDir, 'nfl-season-records.csv'), 'season');
  }

  // Seed pick assets for current + next season
  const season = getCurrentSeason();
  const teams = db.prepare('SELECT id FROM teams').all() as any[];
  const insertPick = db.prepare('INSERT OR IGNORE INTO pick_assets (owner_team_id, original_team_id, season, round) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    for (const team of teams)
      for (let s = season; s <= season + 1; s++)
        for (let r = 1; r <= 7; r++)
          insertPick.run(team.id, team.id, s, r);
  })();

  // Balance rosters on first load if FA pool is empty
  const faCount = (db.prepare("SELECT COUNT(*) as count FROM players WHERE is_free_agent = 1").get() as any).count;
  if (faCount === 0) balanceRosters();
}

// ─── App Window ───────────────────────────────────────────────────────────────

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    height: 700,
    width: 1200,
    webPreferences: { preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY },
  });
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.webContents.openDevTools();
};

// ─── Register Handlers ────────────────────────────────────────────────────────
// Save handlers registered first — they don't need the DB.
// All other handlers are registered immediately but only called after a save is opened.

registerSaveHandlers((isNew: boolean) => {
  bootstrapDatabase(isNew);
});

registerSettingsHandlers();
registerTradeHandlers();
registerSimHandlers();
registerContractHandlers();
registerDraftHandlers();
registerStatsHandlers();
registerSeasonHandlers();
registerNewsHandlers();

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
