import { app, BrowserWindow, Menu } from 'electron';
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
import { registerImportHandlers } from './handlers/importHandlers';
import { registerCoachingHandlers } from './handlers/coachingHandlers';
import { generateAllCoachingStaff } from './services/CoachingService';
import { registerSchemeHandlers, seedTeamSchemes } from './handlers/schemeHandlers';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function bootstrapDatabase(isNew: boolean): void {
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

    const { generatePlayers } = require('./generatePlayers');
    generatePlayers();
    generateContracts();
    console.log('Fresh DB: players and contracts generated');
  }

  const season = getCurrentSeason();
  const teams = db.prepare('SELECT id FROM teams').all() as any[];
  const insertPick = db.prepare('INSERT OR IGNORE INTO pick_assets (owner_team_id, original_team_id, season, round) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    for (const team of teams)
      for (let s = season; s <= season + 1; s++)
        for (let r = 1; r <= 7; r++)
          insertPick.run(team.id, team.id, s, r);
  })();

  const faCount = (db.prepare("SELECT COUNT(*) as count FROM players WHERE is_free_agent = 1").get() as any).count;
  if (faCount === 0) balanceRosters();

  const coachCount = (db.prepare('SELECT COUNT(*) as cnt FROM coaching_staff').get() as any)?.cnt ?? 0;
  if (coachCount === 0) generateAllCoachingStaff();

  const schemeCount = (db.prepare('SELECT COUNT(*) as cnt FROM team_schemes').get() as any)?.cnt ?? 0;
  if (schemeCount === 0) seedTeamSchemes();
}

// ─── App Window ───────────────────────────────────────────────────────────────

const createWindow = (): void => {
  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    height: 700,
    width: 1200,
    show: false,
    webPreferences: { preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

      mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(false);
    setTimeout(() => mainWindow.webContents.focus(), 100);
  });

  mainWindow.on('focus', () => {
    mainWindow.webContents.focus();
  });

  mainWindow.webContents.on('devtools-closed', () => {
    mainWindow.webContents.focus();
  });

    if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
};

// ─── Register Handlers ────────────────────────────────────────────────────────

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
registerImportHandlers();
registerCoachingHandlers();
registerSchemeHandlers();

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
