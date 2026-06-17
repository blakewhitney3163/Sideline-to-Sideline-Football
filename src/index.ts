import { app, BrowserWindow, ipcMain } from 'electron';
const { db, generateContracts } = require('./database');
const { importFromMadden } = require('./importfromMadden');
const { simulateGame } = require('./simulateGame');
import { getCurrentSeason } from './helpers/getCurrentSeason';
import { balanceRosters } from './helpers/balanceRosters';
import { registerSettingsHandlers, getDifficultyFactor } from './handlers/settingsHandlers';
import { registerTradeHandlers } from './handlers/tradeHandlers';
import { registerSimHandlers } from './handlers/simHandlers';
import { registerContractHandlers, calcFairMarket } from './handlers/contractHandlers';
import { registerDraftHandlers } from './handlers/draftHandlers';

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

const POSITION_TO_GROUP: Record<string, string> = {
  QB: 'QB',
  RB: 'RB', HB: 'RB', FB: 'RB',
  WR: 'WR', TE: 'TE',
  LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL', OL: 'OL',
  LE: 'DL', RE: 'DL', DT: 'DL', IDL: 'DL', DL: 'DL',
  MLB: 'LB', OLB: 'LB', LOLB: 'LB', ROLB: 'LB', WILL: 'LB', MIKE: 'LB', LB: 'LB',
  CB: 'CB', FS: 'S', SS: 'S', S: 'S', K: 'K',
};

const WAIVER_POS_MAX: Record<string, number> = {
  QB: 3, RB: 4, WR: 6, TE: 3, OL: 9, DL: 6, LB: 5, CB: 5, S: 4, K: 2,
};
const SOFT_CAP_M = 275;

function initDepthChart(teamId: number) {
  const existing = (db.prepare('SELECT COUNT(*) as count FROM depth_chart WHERE team_id = ?').get(teamId) as any).count;
  if (existing > 0) return;
  const players = db.prepare(`
    SELECT id, position, position_label FROM players
    WHERE team_id = ? AND roster_status = 'active'
    ORDER BY overall_rating DESC
  `).all(teamId) as any[];
  const insert = db.prepare('INSERT OR IGNORE INTO depth_chart (team_id, player_id, position_group, slot) VALUES (?, ?, ?, ?)');
  const groupSlots: Record<string, number> = {};
  const run = db.transaction(() => {
    for (const p of players) {
      const pos = p.position_label || p.position;
      const group = POSITION_TO_GROUP[pos];
      if (!group) continue;
      groupSlots[group] = (groupSlots[group] ?? 0) + 1;
      insert.run(teamId, p.id, group, groupSlots[group]);
    }
  });
  run();
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

ipcMain.handle('balance-rosters', () => {
  balanceRosters();
  const faCount = (db.prepare('SELECT COUNT(*) as count FROM players WHERE is_free_agent = 1').get() as any).count;
  return { success: true, freeAgents: faCount };
});

if (require('electron-squirrel-startup')) {
  app.quit();
}

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

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-standings', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  const teams = db.prepare('SELECT id, city, name, conference, division FROM teams').all();
  return teams.map((team: any) => {
    const wins = db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score))`).get(s, team.id, team.id).count;
    const losses = db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score < away_score) OR (away_team_id = ? AND away_score < home_score))`).get(s, team.id, team.id).count;
    const ties = db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND (home_team_id = ? OR away_team_id = ?) AND home_score = away_score`).get(s, team.id, team.id).count;
    return { ...team, wins, losses, ties };
  });
});

ipcMain.handle('get-teams', () => {
  return db.prepare('SELECT * FROM teams ORDER BY conference, division, name').all();
});

ipcMain.handle('get-roster', (_event: any, teamId: number) => {
  return db.prepare(`
    SELECT id, first_name, last_name, position, position_label, overall_rating, age,
           speed, strength, awareness, dev_trait,
           throw_accuracy, throw_power, catching, route_running,
           tackle_rating, coverage, pass_rush
    FROM players WHERE team_id = ?
    ORDER BY CASE position
      WHEN 'QB' THEN 1 WHEN 'RB' THEN 2 WHEN 'WR' THEN 3 WHEN 'TE' THEN 4
      WHEN 'OL' THEN 5 WHEN 'DL' THEN 6 WHEN 'LB' THEN 7 WHEN 'CB' THEN 8
      WHEN 'S' THEN 9 WHEN 'K' THEN 10 ELSE 11
    END, overall_rating DESC
  `).all(teamId);
});

ipcMain.handle('get-player-stats', (_event: any, playerId: number) => {
  const season = getCurrentSeason();
  return db.prepare(`
    SELECT COUNT(DISTINCT s.game_id) as games,
           SUM(s.pass_attempts) as pass_attempts, SUM(s.completions) as completions,
           SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds, SUM(s.interceptions) as interceptions,
           SUM(s.rush_attempts) as rush_attempts, SUM(s.rush_yards) as rush_yards, SUM(s.rush_tds) as rush_tds,
           SUM(s.targets) as targets, SUM(s.receptions) as receptions, SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds,
           SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles,
           SUM(s.sacks) as sacks, SUM(s.tfl) as tfl,
           SUM(s.def_interceptions) as def_interceptions, SUM(s.pass_deflections) as pass_deflections
    FROM stats s JOIN games g ON s.game_id = g.id WHERE s.player_id = ? AND g.season = ?
  `).get(playerId, season);
});

ipcMain.handle('get-player-career-stats', (_event: any, playerId: number) => {
  const live = db.prepare(`
    SELECT g.season,
           COUNT(DISTINCT s.game_id) as games,
           SUM(s.completions) as completions, SUM(s.pass_attempts) as pass_attempts,
           SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds,
           SUM(s.interceptions) as interceptions,
           SUM(s.rush_attempts) as rush_attempts, SUM(s.rush_yards) as rush_yards,
           SUM(s.rush_tds) as rush_tds,
           SUM(s.targets) as targets, SUM(s.receptions) as receptions,
           SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds,
           SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles,
           SUM(s.sacks) as sacks, SUM(s.tfl) as tfl,
           SUM(s.def_interceptions) as def_interceptions, SUM(s.pass_deflections) as pass_deflections
    FROM stats s JOIN games g ON s.game_id = g.id
    WHERE s.player_id = ? GROUP BY g.season
  `).all(playerId) as any[];

  const history = db.prepare(`
    SELECT season, games, completions, pass_attempts, pass_yards, pass_tds, interceptions,
           rush_attempts, rush_yards, rush_tds, targets, receptions, rec_yards, rec_tds,
           tackles, assisted_tackles, sacks, tfl, def_interceptions, pass_deflections
    FROM career_stats_history WHERE player_id = ?
  `).all(playerId) as any[];

  const liveSeasons = new Set(live.map((r: any) => r.season));
  const combined = [
    ...live,
    ...history.filter((r: any) => !liveSeasons.has(r.season)),
  ].sort((a: any, b: any) => b.season - a.season);

  return combined;
});

ipcMain.handle('get-schedule', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  return db.prepare(`
    SELECT g.id, g.week, g.home_score, g.away_score,
           ht.city || ' ' || ht.name AS home_team, at.city || ' ' || at.name AS away_team
    FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.is_simulated = 1 ORDER BY g.week, g.id
  `).all(s);
});

ipcMain.handle('get-dashboard', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  const topAFC = db.prepare(`
    SELECT t.city || ' ' || t.name AS team_name,
           SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) AS losses
    FROM teams t JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
    WHERE g.season = ? AND g.is_simulated = 1 AND t.conference = 'AFC'
    GROUP BY t.id ORDER BY wins DESC LIMIT 5
  `).all(s);
  const topNFC = db.prepare(`
    SELECT t.city || ' ' || t.name AS team_name,
           SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) AS wins,
           SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) AS losses
    FROM teams t JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
    WHERE g.season = ? AND g.is_simulated = 1 AND t.conference = 'NFC'
    GROUP BY t.id ORDER BY wins DESC LIMIT 5
  `).all(s);
  const recentGames = db.prepare(`
    SELECT g.week, g.home_score, g.away_score,
           ht.city || ' ' || ht.name AS home_team, at.city || ' ' || at.name AS away_team
    FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.is_simulated = 1 ORDER BY g.week DESC, g.id DESC LIMIT 8
  `).all(s);
  return { topAFC, topNFC, recentGames };
});

ipcMain.handle('get-stats', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  const passing = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
           p.overall_rating, p.age, p.position, p.dev_trait,
           t.city || ' ' || t.name AS team_name,
           SUM(st.pass_yards) AS pass_yards, SUM(st.pass_tds) AS pass_tds,
           SUM(st.interceptions) AS interceptions, SUM(st.completions) AS completions,
           SUM(st.pass_attempts) AS pass_attempts
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.pass_attempts > 0 GROUP BY p.id ORDER BY pass_yards DESC LIMIT 15
  `).all(s);
  const rushing = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
           p.overall_rating, p.age, p.position, p.dev_trait,
           t.city || ' ' || t.name AS team_name,
           SUM(st.rush_yards) AS rush_yards, SUM(st.rush_tds) AS rush_tds,
           SUM(st.rush_attempts) AS rush_attempts
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.rush_attempts > 0 GROUP BY p.id ORDER BY rush_yards DESC LIMIT 15
  `).all(s);
  const receiving = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
           p.overall_rating, p.age, p.position, p.dev_trait,
           t.city || ' ' || t.name AS team_name,
           SUM(st.rec_yards) AS rec_yards, SUM(st.rec_tds) AS rec_tds,
           SUM(st.receptions) AS receptions, SUM(st.targets) AS targets
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.targets > 0 GROUP BY p.id ORDER BY rec_yards DESC LIMIT 15
  `).all(s);
  const tackles = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
           p.overall_rating, p.age, p.position, p.dev_trait,
           t.city || ' ' || t.name AS team_name,
           SUM(st.tackles) AS tackles, SUM(st.assisted_tackles) AS assisted_tackles,
           SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl,
           SUM(st.forced_fumbles) AS forced_fumbles
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.tackles > 0 GROUP BY p.id ORDER BY tackles DESC LIMIT 15
  `).all(s);
  const sacks = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
           p.overall_rating, p.age, p.position, p.dev_trait,
           t.city || ' ' || t.name AS team_name,
           SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl,
           SUM(st.forced_fumbles) AS forced_fumbles, SUM(st.tackles) AS tackles
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.sacks > 0 GROUP BY p.id ORDER BY sacks DESC LIMIT 15
  `).all(s);
  const defInterceptions = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
           p.overall_rating, p.age, p.position, p.dev_trait,
           t.city || ' ' || t.name AS team_name,
           SUM(st.def_interceptions) AS def_interceptions,
           SUM(st.pass_deflections) AS pass_deflections,
           SUM(st.def_tds) AS def_tds, SUM(st.tackles) AS tackles
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND (st.def_interceptions > 0 OR st.pass_deflections > 0) GROUP BY p.id ORDER BY def_interceptions DESC, pass_deflections DESC LIMIT 15
  `).all(s);
  return { passing, rushing, receiving, tackles, sacks, defInterceptions };
});

ipcMain.handle('get-hall-of-fame', () => {
  return db.prepare('SELECT * FROM hall_of_fame ORDER BY inducted_season DESC, name ASC').all();
});

ipcMain.handle('get-team-season-stats', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  const pointRows = db.prepare(`
    SELECT t.id, t.city, t.name,
           COUNT(g.id) as games,
           SUM(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.away_score END) as points_for,
           SUM(CASE WHEN g.home_team_id = t.id THEN g.away_score ELSE g.home_score END) as points_against,
           SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) as wins,
           SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) as losses
    FROM teams t
    JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
    WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
    GROUP BY t.id
  `).all(s) as any[];

  const statRows = db.prepare(`
    SELECT s.team_id,
           SUM(s.pass_yards + s.rush_yards) as off_yards,
           SUM(s.interceptions) as turnovers_given,
           SUM(s.def_interceptions + COALESCE(s.fumble_recoveries, 0)) as turnovers_taken
    FROM stats s JOIN games g ON s.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
    GROUP BY s.team_id
  `).all(s) as any[];

  return pointRows.map((t: any) => {
    const st = statRows.find((r: any) => r.team_id === t.id) ?? {};
    const g = Math.max(t.games, 1);
    const toGiven = st.turnovers_given ?? 0;
    const toTaken = st.turnovers_taken ?? 0;
    return {
      ...t,
      ppg: Math.round((t.points_for / g) * 10) / 10,
      papg: Math.round((t.points_against / g) * 10) / 10,
      ypg: Math.round((st.off_yards ?? 0) / g),
      to_diff: toTaken - toGiven,
      to_given: toGiven,
      to_taken: toTaken,
    };
  }).sort((a: any, b: any) => b.ppg - a.ppg);
});

ipcMain.handle('get-playoffs', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  return db.prepare(`
    SELECT g.week, g.home_score, g.away_score,
           ht.city || ' ' || ht.name AS home_team, at.city || ' ' || at.name AS away_team
    FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.is_playoff = 1 ORDER BY g.week, g.id
  `).all(s);
});

ipcMain.handle('get-champions', () => {
  return db.prepare(`
    SELECT c.season, t.city || ' ' || t.name AS team_name, t.conference
    FROM champions c JOIN teams t ON c.team_id = t.id ORDER BY c.season DESC
  `).all();
});

ipcMain.handle('get-seasons', () => {
  return db.prepare(`SELECT DISTINCT season FROM games WHERE is_simulated = 1 ORDER BY season DESC`).all().map((r: any) => r.season);
});

ipcMain.handle('get-current-season', () => getCurrentSeason());

ipcMain.handle('advance-season', () => {
  const current = getCurrentSeason();
  const next = current + 1;

  db.prepare("UPDATE players SET age = age + 1 WHERE roster_status != 'retired'").run();

  const players = db.prepare(
    `SELECT id, age, overall_rating, speed, strength, awareness, dev_trait, position,
     throw_accuracy, throw_power, catching, route_running, tackle_rating, coverage, pass_rush
     FROM players WHERE roster_status != 'retired'`
  ).all() as any[];

  const progressionTable: Record<string, Record<string, [number, number]>> = {
    young:   { Normal: [0, 1], Star: [1, 2], Superstar: [2, 3], 'X-Factor': [3, 4] },
    rising:  { Normal: [0, 1], Star: [0, 2], Superstar: [1, 2], 'X-Factor': [2, 3] },
    prime:   { Normal: [-1, 0], Star: [0, 1], Superstar: [0, 1], 'X-Factor': [0, 1] },
    decline: { Normal: [-2,-1], Star: [-1, 0], Superstar: [-1, 0], 'X-Factor': [-1, 0] },
    old:     { Normal: [-3,-2], Star: [-2,-1], Superstar: [-2,-1], 'X-Factor': [-1, 0] },
    veteran: { Normal: [-4,-3], Star: [-3,-2], Superstar: [-3,-2], 'X-Factor': [-2,-1] },
  };

  const updatePlayer = db.prepare(`
    UPDATE players SET overall_rating = ?, speed = ?, strength = ?, awareness = ?,
    throw_accuracy = ?, throw_power = ?, catching = ?, route_running = ?,
    tackle_rating = ?, coverage = ?, pass_rush = ?
    WHERE id = ?
  `);
  const attr = (cur: number, growP: number, decP: number, amt = 1): number => {
    const r = Math.random();
    if (r < growP) return Math.min(99, cur + amt);
    if (r < growP + decP) return Math.max(40, cur - amt);
    return cur;
  };
  const progressPlayers = db.transaction(() => {
    for (const p of players) {
      const trait = p.dev_trait ?? 'Normal';
      const bracket =
        p.age <= 23 ? 'young' : p.age <= 26 ? 'rising' : p.age <= 29 ? 'prime' :
        p.age <= 32 ? 'decline' : p.age <= 35 ? 'old' : 'veteran';
      const [min, max] = progressionTable[bracket][trait] ?? [0, 0];
      const ovrChange = Math.floor(Math.random() * (max - min + 1)) + min;
      const newOvr = Math.max(40, Math.min(99, p.overall_rating + ovrChange));
      const isYoung = p.age <= 26;
      const isOld = p.age >= 32;
      const newSpeed = attr(p.speed ?? 70, isYoung ? 0.20 : 0.03, p.age >= 34 ? 0.70 : p.age >= 31 ? 0.40 : p.age >= 29 ? 0.15 : 0.03);
      const newStrength = attr(p.strength ?? 70, p.age <= 25 ? 0.35 : 0.05, isOld ? 0.30 : 0.05);
      const newAwareness = attr(p.awareness ?? 70, isYoung ? 0.35 : p.age <= 31 ? 0.15 : 0.05, p.age >= 35 ? 0.30 : 0.05);
      const pos = p.position;
      const newThrowAcc = attr(p.throw_accuracy ?? 70, isYoung && pos === 'QB' ? 0.40 : 0.03, isOld ? 0.25 : 0.04);
      const newThrowPwr = attr(p.throw_power ?? 70, isYoung && pos === 'QB' ? 0.25 : 0.02, isOld ? 0.30 : 0.05);
      const isRecvr = ['WR', 'TE', 'RB', 'HB', 'FB'].includes(pos);
      const newCatching = attr(p.catching ?? 70, isYoung && isRecvr ? 0.35 : 0.04, isOld ? 0.25 : 0.04);
      const newRouteRunning = attr(p.route_running ?? 70, isYoung && ['WR', 'TE'].includes(pos) ? 0.35 : 0.03, isOld ? 0.20 : 0.04);
      const isDef = ['DL', 'DE', 'DT', 'LE', 'RE', 'IDL', 'LB', 'MLB', 'OLB', 'CB', 'S', 'FS', 'SS'].includes(pos);
      const newTackle = attr(p.tackle_rating ?? 70, isYoung && isDef ? 0.30 : 0.04, isOld ? 0.25 : 0.05);
      const newCoverage = attr(p.coverage ?? 70, isYoung && ['CB', 'S', 'FS', 'SS', 'LB', 'MLB', 'OLB'].includes(pos) ? 0.30 : 0.04, isOld ? 0.25 : 0.05);
      const newPassRush = attr(p.pass_rush ?? 70, isYoung && ['DL', 'DE', 'DT', 'LE', 'RE', 'IDL', 'LB', 'OLB'].includes(pos) ? 0.30 : 0.04, isOld ? 0.25 : 0.05);
      updatePlayer.run(
        newOvr, newSpeed, newStrength, newAwareness,
        newThrowAcc, newThrowPwr, newCatching, newRouteRunning,
        newTackle, newCoverage, newPassRush,
        p.id
      );
    }
  });
  progressPlayers();

  const breakoutIds = new Set();
  const bSeason = current;
  const breakoutStats = db.prepare(`
    SELECT s.player_id, p.age, p.position,
           SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds,
           SUM(s.rush_yards) as rush_yards,
           SUM(s.rec_yards) as rec_yards,
           SUM(s.sacks) as sacks, SUM(s.def_interceptions) as def_int,
           SUM(s.tackles) + SUM(s.assisted_tackles) as total_tkl
    FROM stats s
    JOIN games g ON s.game_id = g.id
    JOIN players p ON s.player_id = p.id
    WHERE g.season = ? AND g.is_simulated = 1
    GROUP BY s.player_id
  `).all(bSeason) as any[];

  for (const row of breakoutStats) {
    const isBreakout =
      (row.position === 'QB' && (row.pass_yards > 4000 || row.pass_tds > 30)) ||
      (['RB','HB','FB'].includes(row.position) && row.rush_yards > 1300) ||
      (['WR','TE'].includes(row.position) && row.rec_yards > 1100) ||
      (row.sacks > 10) ||
      (row.def_int > 5) ||
      (row.total_tkl > 130);

    if (isBreakout && row.age <= 28) breakoutIds.add(row.player_id);
  }

  if (breakoutIds.size > 0) {
    const applyBreakout = db.transaction(() => {
      for (const pid of breakoutIds) {
        const pp = db.prepare('SELECT age FROM players WHERE id = ?').get(pid) as any;
        const bonus = pp && pp.age <= 24 ? 2 : 1;
        db.prepare('UPDATE players SET overall_rating = MIN(99, overall_rating + ?) WHERE id = ?').run(bonus, pid);
      }
    });
    applyBreakout();
  }

  const setTrait = db.prepare('UPDATE players SET dev_trait = ? WHERE id = ?');
  const traitChanges = db.transaction(() => {
    for (const p of players) {
      const trait = p.dev_trait ?? 'Normal';
      const rand = Math.random();
      if (trait === 'X-Factor') {
        if (p.age >= 32 || p.overall_rating < 88 || rand < 0.04) setTrait.run('Superstar', p.id);
      } else if (trait === 'Superstar') {
        if (p.age >= 34 || p.overall_rating < 82 || rand < 0.05) setTrait.run('Star', p.id);
      } else if (trait === 'Star') {
        if (p.age >= 36 || p.overall_rating < 76 || rand < 0.06) setTrait.run('Normal', p.id);
        else if (p.age <= 27 && p.overall_rating >= 84 && rand < 0.05) setTrait.run('Superstar', p.id);
      } else {
        if (p.age <= 26 && p.overall_rating >= 76 && rand < 0.08) setTrait.run('Star', p.id);
        else if (p.age <= 24 && p.overall_rating >= 83 && rand < 0.04) setTrait.run('Superstar', p.id);
      }
    }
  });
  traitChanges();

  const retireCandidates = db.prepare(
    "SELECT id, first_name, last_name, position, age, overall_rating FROM players WHERE age >= 33 AND roster_status != 'retired'"
  ).all() as any[];

  const retired: { id: number; name: string; position: string; age: number; ovr: number }[] = [];
  const retirePlayers = db.transaction(() => {
    for (const p of retireCandidates) {
      let chance =
        p.age >= 40 ? 0.95 :
        p.age >= 38 ? 0.75 :
        p.age >= 36 ? 0.40 :
        p.age >= 34 ? 0.18 : 0.07;
      if (p.overall_rating < 72) chance = Math.min(0.95, chance * 1.5);
      if (Math.random() < chance) {
        db.prepare("UPDATE players SET roster_status = 'retired', team_id = NULL, is_free_agent = 0 WHERE id = ?").run(p.id);
        db.prepare('DELETE FROM contracts WHERE player_id = ?').run(p.id);
        retired.push({ id: p.id, name: `${p.first_name} ${p.last_name}`, position: p.position, age: p.age, ovr: p.overall_rating });
      }
    }
  });
  retirePlayers();

  const userTeamIdRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  const userTeamId = userTeamIdRow ? parseInt(userTeamIdRow.value) : -1;

  const expiringCpuPlayers = db.prepare(`
    SELECT p.id, p.overall_rating, p.age, p.position, p.dev_trait, c.team_id
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.years_remaining = 1
      AND c.team_id != ?
      AND p.roster_status = 'active'
  `).all(userTeamId) as any[];

  let cpuResigns = 0;
  const doResigns = db.transaction(() => {
    for (const p of expiringCpuPlayers) {
      const resignChance =
        p.overall_rating >= 88 ? 0.90 :
        p.overall_rating >= 82 ? 0.80 :
        p.overall_rating >= 75 ? 0.65 :
        p.overall_rating >= 70 ? 0.40 : 0.20;

      if (Math.random() < resignChance) {
        const fair = calcFairMarket(p.overall_rating, p.position, p.dev_trait);
        const salary = Math.round(fair * (1.0 + Math.random() * 0.10) * 10) / 10;
        const years = p.age <= 26 ? 3 : p.age <= 30 ? 2 : 1;
        db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ? WHERE player_id = ?')
          .run(years, years, salary, p.id);
        cpuResigns++;
      }
    }
  });
  doResigns();

  db.prepare('UPDATE contracts SET years_remaining = years_remaining - 1').run();
  const expiredPlayers = db.prepare('SELECT player_id FROM contracts WHERE years_remaining <= 0').all() as any[];
  const expireContracts = db.transaction(() => {
    for (const { player_id } of expiredPlayers) {
      db.prepare('DELETE FROM contracts WHERE player_id = ?').run(player_id);
      db.prepare("UPDATE players SET team_id = NULL, is_free_agent = 1, roster_status = 'free_agent' WHERE id = ?").run(player_id);
    }
  });
  expireContracts();

  db.prepare("UPDATE players SET injury_status = 'healthy', weeks_out = 0, injury_type = NULL").run();
  db.prepare("UPDATE players SET roster_status = 'free_agent', is_free_agent = 1 WHERE roster_status = 'waivers'").run();

  db.prepare(`
    INSERT INTO career_stats_history (
      player_id, season, games,
      completions, pass_attempts, pass_yards, pass_tds, interceptions,
      rush_attempts, rush_yards, rush_tds,
      targets, receptions, rec_yards, rec_tds,
      tackles, assisted_tackles, sacks, tfl,
      forced_fumbles, fumble_recoveries, def_interceptions, pass_deflections, def_tds
    )
    SELECT s.player_id, g.season,
      COUNT(DISTINCT s.game_id),
      SUM(s.completions), SUM(s.pass_attempts), SUM(s.pass_yards),
      SUM(s.pass_tds), SUM(s.interceptions),
      SUM(s.rush_attempts), SUM(s.rush_yards), SUM(s.rush_tds),
      SUM(s.targets), SUM(s.receptions), SUM(s.rec_yards), SUM(s.rec_tds),
      SUM(s.tackles), SUM(s.assisted_tackles), SUM(s.sacks), SUM(s.tfl),
      SUM(s.forced_fumbles), SUM(s.fumble_recoveries),
      SUM(s.def_interceptions), SUM(s.pass_deflections), SUM(s.def_tds)
    FROM stats s JOIN games g ON s.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1
    GROUP BY s.player_id, g.season
    ON CONFLICT(player_id, season) DO UPDATE SET
      games = excluded.games,
      completions = excluded.completions, pass_attempts = excluded.pass_attempts,
      pass_yards = excluded.pass_yards, pass_tds = excluded.pass_tds,
      interceptions = excluded.interceptions, rush_attempts = excluded.rush_attempts,
      rush_yards = excluded.rush_yards, rush_tds = excluded.rush_tds,
      targets = excluded.targets, receptions = excluded.receptions,
      rec_yards = excluded.rec_yards, rec_tds = excluded.rec_tds,
      tackles = excluded.tackles, assisted_tackles = excluded.assisted_tackles,
      sacks = excluded.sacks, tfl = excluded.tfl,
      forced_fumbles = excluded.forced_fumbles, fumble_recoveries = excluded.fumble_recoveries,
      def_interceptions = excluded.def_interceptions,
      pass_deflections = excluded.pass_deflections, def_tds = excluded.def_tds
  `).run(current);

  const hofInductees: { name: string; position: string }[] = [];
  const runHof = db.transaction(() => {
    for (const r of retired) {
      if (db.prepare('SELECT id FROM hall_of_fame WHERE player_id = ?').get(r.id)) continue;
      const detail = db.prepare('SELECT dev_trait FROM players WHERE id = ?').get(r.id) as any;
      const career = db.prepare(`
        SELECT SUM(games) as games,
               SUM(pass_yards) as pass_yards, SUM(pass_tds) as pass_tds,
               SUM(rush_yards) as rush_yards, SUM(rush_tds) as rush_tds,
               SUM(rec_yards) as rec_yards, SUM(rec_tds) as rec_tds,
               SUM(receptions) as receptions,
               SUM(tackles) as tackles, SUM(CAST(sacks AS REAL)) as sacks,
               SUM(def_interceptions) as def_interceptions,
               SUM(pass_deflections) as pass_deflections
        FROM career_stats_history WHERE player_id = ?
      `).get(r.id) as any;
      if (!career?.games || !isHOFEligible(r.position, career)) continue;
      db.prepare(`INSERT OR IGNORE INTO hall_of_fame (
        player_id, name, position, inducted_season, dev_trait, peak_ovr,
        career_games, career_pass_yards, career_pass_tds,
        career_rush_yards, career_rush_tds,
        career_rec_yards, career_rec_tds, career_receptions,
        career_tackles, career_sacks, career_def_ints, career_pass_deflections
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(r.id, r.name, r.position, next,
          detail?.dev_trait ?? 'Normal', r.ovr,
          career.games ?? 0,
          career.pass_yards ?? 0, career.pass_tds ?? 0,
          career.rush_yards ?? 0, career.rush_tds ?? 0,
          career.rec_yards ?? 0, career.rec_tds ?? 0, career.receptions ?? 0,
          career.tackles ?? 0, career.sacks ?? 0,
          career.def_interceptions ?? 0, career.pass_deflections ?? 0);
      hofInductees.push({ name: r.name, position: r.position });
    }
  });
  runHof();

  db.prepare("UPDATE settings SET value = ? WHERE key = 'current_season'").run(String(next));

  return { nextSeason: next, retired, cpuResigns, breakouts: breakoutIds.size, hofInductees };
});

// ─── Depth Chart ──────────────────────────────────────────────────────────────

ipcMain.handle('get-depth-chart', (_event: any, teamId: number) => {
  initDepthChart(teamId);
  const rows = db.prepare(`
    SELECT dc.position_group, dc.slot, p.id as player_id, p.first_name, p.last_name,
           p.position, p.position_label, p.overall_rating, p.age, p.dev_trait,
           p.speed, p.strength, p.awareness,
           p.injury_status, p.weeks_out, p.injury_type
    FROM depth_chart dc
    JOIN players p ON dc.player_id = p.id
    WHERE dc.team_id = ?
    ORDER BY dc.position_group, dc.slot
  `).all(teamId) as any[];
  const grouped: Record<string, any[]> = {};
  for (const row of rows) {
    const g = row.position_group;
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(row);
  }
  return grouped;
});

ipcMain.handle('set-depth-chart-order', (_event: any, { teamId, positionGroup, playerIds }: {
  teamId: number; positionGroup: string; playerIds: number[];
}) => {
  const update = db.prepare('UPDATE depth_chart SET slot = ? WHERE team_id = ? AND player_id = ? AND position_group = ?');
  const run = db.transaction(() => {
    playerIds.forEach((pid, idx) => update.run(idx + 1, teamId, pid, positionGroup));
  });
  run();
  return { success: true };
});

ipcMain.handle('reset-depth-chart', (_event: any, teamId: number) => {
  db.prepare('DELETE FROM depth_chart WHERE team_id = ?').run(teamId);
  initDepthChart(teamId);
  return { success: true };
});

// ─── Historical Records ────────────────────────────────────────────────────────

ipcMain.handle('get-alltime-leaders', () => {
  const historical = db.prepare(`
    SELECT category, player_name, team_display as team_name, position, games_played,
           pass_yards, pass_tds, interceptions, completions, pass_attempts,
           rush_yards, rush_tds, rush_attempts, rec_yards, rec_tds, receptions, 0 as targets,
           tackles, assisted_tackles, sacks, 0 as tfl, def_interceptions, pass_deflections, forced_fumbles,
           1 as is_historical, 0 as overall_rating, 'Normal' as dev_trait, 0 as player_id, NULL as age
    FROM historical_records WHERE record_type = 'alltime'
  `).all() as any[];

  const ingame = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
           t.name as team_name, p.overall_rating, p.age, p.position, p.dev_trait,
           SUM(h.games) as games_played,
           SUM(h.pass_yards) as pass_yards, SUM(h.pass_tds) as pass_tds, SUM(h.interceptions) as interceptions,
           SUM(h.completions) as completions, SUM(h.pass_attempts) as pass_attempts,
           SUM(h.rush_yards) as rush_yards, SUM(h.rush_tds) as rush_tds, SUM(h.rush_attempts) as rush_attempts,
           SUM(h.rec_yards) as rec_yards, SUM(h.rec_tds) as rec_tds, SUM(h.receptions) as receptions, 0 as targets,
           SUM(h.tackles) as tackles, SUM(h.assisted_tackles) as assisted_tackles,
           SUM(h.sacks) as sacks, 0 as tfl, SUM(h.def_interceptions) as def_interceptions,
           SUM(h.pass_deflections) as pass_deflections, SUM(h.forced_fumbles) as forced_fumbles,
           0 as is_historical
    FROM career_stats_history h
    JOIN players p ON h.player_id = p.id
    LEFT JOIN teams t ON p.team_id = t.id
    GROUP BY p.id
  `).all() as any[];

  const sortBy: Record<string, string> = {
    passing: 'pass_yards', rushing: 'rush_yards', receiving: 'rec_yards',
    tds: '_skill_tds', passTds: 'pass_tds',
    tackles: 'tackles', sacks: 'sacks', defInts: 'def_interceptions',
  };

  const result: any = {};
  for (const [cat, sortKey] of Object.entries(sortBy)) {
    const combined = [...historical.filter((r: any) => r.category === cat), ...ingame];
    const sorted = combined.sort((a: any, b: any) => {
      const av = sortKey === '_skill_tds' ? ((a.rush_tds || 0) + (a.rec_tds || 0)) : (parseFloat(a[sortKey]) || 0);
      const bv = sortKey === '_skill_tds' ? ((b.rush_tds || 0) + (b.rec_tds || 0)) : (parseFloat(b[sortKey]) || 0);
      return bv - av;
    }).slice(0, 15);
    result[cat] = sorted;
  }
  return result;
});

ipcMain.handle('get-season-records', () => {
  const historical = db.prepare(`
    SELECT category, player_name, team_display as team_name, position, season, games_played,
           pass_yards, pass_tds, interceptions, completions, pass_attempts,
           rush_yards, rush_tds, rush_attempts, rec_yards, rec_tds, receptions, 0 as targets,
           tackles, assisted_tackles, sacks, 0 as tfl, def_interceptions, pass_deflections, forced_fumbles,
           1 as is_historical, 0 as overall_rating, 'Normal' as dev_trait, 0 as player_id, NULL as age
    FROM historical_records WHERE record_type = 'season'
  `).all() as any[];

  const ingame = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
           t.name as team_name, p.overall_rating, p.age, p.position, p.dev_trait,
           g.season, COUNT(DISTINCT s.game_id) as games_played,
           SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds, SUM(s.interceptions) as interceptions,
           SUM(s.completions) as completions, SUM(s.pass_attempts) as pass_attempts,
           SUM(s.rush_yards) as rush_yards, SUM(s.rush_tds) as rush_tds, SUM(s.rush_attempts) as rush_attempts,
           SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds, SUM(s.receptions) as receptions, 0 as targets,
           SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles,
           SUM(s.sacks) as sacks, 0 as tfl, SUM(s.def_interceptions) as def_interceptions,
           SUM(s.pass_deflections) as pass_deflections, SUM(s.forced_fumbles) as forced_fumbles,
           0 as is_historical
    FROM stats s
    JOIN players p ON s.player_id = p.id
    JOIN games g ON s.game_id = g.id
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE g.is_playoff = 0
    GROUP BY p.id, g.season
  `).all() as any[];

  const sortBy: Record<string, string> = {
    passing: 'pass_yards', rushing: 'rush_yards', receiving: 'rec_yards',
    tds: '_skill_tds', passTds: 'pass_tds',
    tackles: 'tackles', sacks: 'sacks', defInts: 'def_interceptions',
  };

  const result: any = {};
  for (const [cat, sortKey] of Object.entries(sortBy)) {
    const combined = [...historical.filter((r: any) => r.category === cat), ...ingame];
    const sorted = combined.sort((a: any, b: any) => {
      const av = sortKey === '_skill_tds' ? ((a.rush_tds || 0) + (a.rec_tds || 0)) : (parseFloat(a[sortKey]) || 0);
      const bv = sortKey === '_skill_tds' ? ((b.rush_tds || 0) + (b.rec_tds || 0)) : (parseFloat(b[sortKey]) || 0);
      return bv - av;
    }).slice(0, 15);
    result[cat] = sorted;
  }
  return result;
});

ipcMain.handle('get-season-awards', (_event: any, season: number) => {
  const offStats = db.prepare(`
    SELECT p.id, p.first_name || ' ' || p.last_name as name,
           p.position, p.position_label, p.age, p.overall_rating, p.dev_trait,
           p.team_id, t.name as team_name, t.city as team_city,
           SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds,
           SUM(s.interceptions) as interceptions,
           SUM(s.rush_yards) as rush_yards, SUM(s.rush_tds) as rush_tds,
           SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds,
           SUM(s.receptions) as receptions,
           COUNT(DISTINCT s.game_id) as games
    FROM stats s
    JOIN players p ON s.player_id = p.id
    JOIN teams t ON p.team_id = t.id
    JOIN games g ON s.game_id = g.id
    WHERE g.season = ? AND g.is_playoff = 0
    GROUP BY p.id HAVING games > 0
  `).all(season) as any[];

  const defStats = db.prepare(`
    SELECT p.id, p.first_name || ' ' || p.last_name as name,
           p.position, p.position_label, p.age, p.overall_rating, p.dev_trait,
           p.team_id, t.name as team_name, t.city as team_city,
           SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles,
           SUM(s.sacks) as sacks, SUM(s.def_interceptions) as def_interceptions,
           SUM(s.pass_deflections) as pass_deflections, SUM(s.forced_fumbles) as forced_fumbles,
           COUNT(DISTINCT s.game_id) as games
    FROM stats s
    JOIN players p ON s.player_id = p.id
    JOIN teams t ON p.team_id = t.id
    JOIN games g ON s.game_id = g.id
    WHERE g.season = ? AND g.is_playoff = 0
    GROUP BY p.id HAVING games > 0
  `).all(season) as any[];

  const offScore = (p: any) =>
    (p.pass_yards || 0) * 0.04 + (p.pass_tds || 0) * 6 - (p.interceptions || 0) * 3 +
    (p.rush_yards || 0) * 0.1 + (p.rush_tds || 0) * 6 +
    (p.rec_yards || 0) * 0.1 + (p.rec_tds || 0) * 6;

  const defScore = (p: any) =>
    (p.tackles || 0) * 2 + (p.sacks || 0) * 10 +
    (p.def_interceptions || 0) * 8 + (p.pass_deflections || 0) * 2 +
    (p.forced_fumbles || 0) * 5;

  const OFF_POS = ['QB', 'RB', 'WR', 'TE'];
  const DEF_POS = ['DL', 'LB', 'CB', 'S'];

  const offPlayers = offStats.filter((p: any) => OFF_POS.includes(p.position));
  const defPlayers = defStats.filter((p: any) => DEF_POS.includes(p.position));
  const topOff = [...offPlayers].sort((a: any, b: any) => offScore(b) - offScore(a));
  const topDef = [...defPlayers].sort((a: any, b: any) => defScore(b) - defScore(a));

  const coyRow = db.prepare(`
    SELECT t.id, t.city, t.name,
           SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
                    OR (g.away_team_id = t.id AND g.away_score > g.home_score)
                    THEN 1 ELSE 0 END) as wins
    FROM games g
    JOIN teams t ON g.home_team_id = t.id OR g.away_team_id = t.id
    WHERE g.season = ? AND g.is_playoff = 0 AND g.is_simulated = 1
    GROUP BY t.id ORDER BY wins DESC LIMIT 1
  `).get(season) as any;

  return {
    mvp: topOff[0] || null,
    opoy: topOff.find((p: any) => p.position !== 'QB') || null,
    dpoy: topDef[0] || null,
    oroty: topOff.filter((p: any) => p.age <= 23)[0] || null,
    droty: topDef.filter((p: any) => p.age <= 23)[0] || null,
    coy: coyRow || null,
  };
});

// ─── NFLverse Stats Import ────────────────────────────────────────────────────
ipcMain.handle('import-nflverse-stats', () => {
  const pathModule = require('path');
  const fsModule = require('fs');

  const csvPath = pathModule.join(process.cwd(), 'src', 'data', 'player-career-stats.csv');
  if (!fsModule.existsSync(csvPath)) {
    return { success: false, matched: 0, error: 'player-career-stats.csv not found — run scripts/fetch-career-stats.js first' };
  }

  const norm = (s: string) => s.toLowerCase().replace(/['\u2019.]/g, '').replace(/\s+/g, ' ').trim();
  const players = db.prepare('SELECT id, first_name, last_name FROM players').all() as any[];
  const byName: Record<string, any> = {};
  for (const p of players) byName[norm(`${p.first_name} ${p.last_name}`)] = p;

  const parseCSV = (filePath: string) => {
    const lines = fsModule.readFileSync(filePath, 'utf8').split('\n').filter((l: string) => l.trim());
    const headers = lines[0].split(',').map((h: string) => h.trim());
    return lines.slice(1).map((line: string) => {
      const vals: string[] = [];
      let cur = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
        else { cur += ch; }
      }
      vals.push(cur);
      const r: any = {};
      headers.forEach((h: string, i: number) => { r[h] = (vals[i] ?? '').trim(); });
      return r;
    });
  };

  const offRows = parseCSV(csvPath);

  const upsertOff = db.prepare(`
    INSERT OR IGNORE INTO career_stats_history
    (player_id, season, games,
     completions, pass_attempts, pass_yards, pass_tds, interceptions,
     rush_attempts, rush_yards, rush_tds,
     targets, receptions, rec_yards, rec_tds)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let matched = 0, skipped = 0;
  const runOff = db.transaction(() => {
    for (const r of offRows) {
      const player = byName[norm(r.player_display_name ?? '')];
      if (!player) { skipped++; continue; }
      const season = parseInt(r.season);
      if (!season) { skipped++; continue; }
      upsertOff.run(
        player.id, season,
        parseInt(r.games) || 0,
        parseInt(r.completions) || 0,
        parseInt(r.attempts) || 0,
        parseInt(r.passing_yards) || 0,
        parseInt(r.passing_tds) || 0,
        parseInt(r.interceptions) || 0,
        parseInt(r.carries) || 0,
        parseInt(r.rushing_yards) || 0,
        parseInt(r.rushing_tds) || 0,
        parseInt(r.targets) || 0,
        parseInt(r.receptions) || 0,
        parseInt(r.receiving_yards) || 0,
        parseInt(r.receiving_tds) || 0,
      );
      matched++;
    }
  });
  runOff();

  const defCsvPath = pathModule.join(process.cwd(), 'src', 'data', 'player-career-stats-def.csv');
  let defMatched = 0;

  if (fsModule.existsSync(defCsvPath)) {
    const defRows = parseCSV(defCsvPath);

    const upsertDef = db.prepare(`
      INSERT INTO career_stats_history
      (player_id, season, games, tackles, assisted_tackles, sacks, tfl,
       forced_fumbles, def_interceptions, pass_deflections, def_tds)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(player_id, season) DO UPDATE SET
        tackles = excluded.tackles,
        assisted_tackles = excluded.assisted_tackles,
        sacks = excluded.sacks,
        tfl = excluded.tfl,
        forced_fumbles = excluded.forced_fumbles,
        def_interceptions = excluded.def_interceptions,
        pass_deflections = excluded.pass_deflections,
        def_tds = excluded.def_tds,
        games = MAX(career_stats_history.games, excluded.games)
    `);

    const runDef = db.transaction(() => {
      for (const r of defRows) {
        const player = byName[norm(r.player_display_name ?? '')];
        if (!player) continue;
        const season = parseInt(r.season);
        if (!season) continue;
        upsertDef.run(
          player.id, season,
          parseInt(r.games) || 0,
          parseFloat(r.tackles) || 0,
          parseFloat(r.assisted_tackles) || 0,
          parseFloat(r.sacks) || 0,
          parseFloat(r.tfl) || 0,
          parseFloat(r.forced_fumbles) || 0,
          parseFloat(r.def_interceptions) || 0,
          parseFloat(r.pass_deflections) || 0,
          parseFloat(r.def_tds) || 0,
        );
        defMatched++;
      }
    });
    runDef();
  }

  console.log(`Career stats: ${matched} offense matched, ${skipped} skipped, ${defMatched} defense matched`);
  return { success: true, matched: matched + defMatched, skipped };
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────

registerSettingsHandlers();
registerTradeHandlers();
registerSimHandlers();
registerContractHandlers();
registerDraftHandlers();

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
