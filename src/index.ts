import started from 'electron-squirrel-startup';
if (started) process.exit(0);

import { app, BrowserWindow, Menu, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
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
import { generateAllScouts } from './services/ScoutingService';
import { registerSchemeHandlers, seedTeamSchemes } from './handlers/schemeHandlers';
import { registerInjuryHandlers } from './handlers/injuryHandlers';
import { registerChemistryHandlers } from './handlers/chemistryHandlers';
import { registerLiveGameHandlers } from './handlers/liveGameHandlers';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// ─── Single Instance Lock ──────────────────────────────────────────────────────

const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
  process.exit(0);
}

// ─── Crash Logging ─────────────────────────────────────────────────────────────

function writeCrashLog(message: string): void {
  try {
    const logPath = path.join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch { /* if logging itself fails, don't crash */ }
}

process.on('uncaughtException', (err) => {
  writeCrashLog(`uncaughtException: ${err.stack ?? err.message}`);
});

process.on('unhandledRejection', (reason) => {
  writeCrashLog(`unhandledRejection: ${String(reason)}`);
});

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

    const scoutCount = (db.prepare('SELECT COUNT(*) as cnt FROM scouts').get() as any)?.cnt ?? 0;
  if (scoutCount === 0) generateAllScouts();
}

// ─── App Window ───────────────────────────────────────────────────────────────

const createWindow = (): void => {
  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    height: 700,
    width: 1200,
    minWidth: 1100,
    minHeight: 650,
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
    setTimeout(() => {
      mainWindow.focus();
      mainWindow.webContents.focus();
    }, 250);
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

// ─── Second Instance — focus existing window ──────────────────────────────────

app.on('second-instance', () => {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length > 0) {
    const win = windows[0];
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

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
registerInjuryHandlers();
registerChemistryHandlers();
registerLiveGameHandlers();

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.on('ready', () => {
  createWindow();

  if (process.env.NODE_ENV !== 'development') {
    globalShortcut.register('Control+R', () => {});
    globalShortcut.register('CommandOrControl+R', () => {});
    globalShortcut.register('F5', () => {});
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
