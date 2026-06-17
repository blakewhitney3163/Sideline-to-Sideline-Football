import { app, BrowserWindow, ipcMain } from 'electron';
const { db, generateContracts } = require('./database');
const { importFromMadden } = require('./importfromMadden');
const { simulateGame } = require('./simulateGame');
import { getCurrentSeason } from './helpers/getCurrentSeason';
import { balanceRosters } from './helpers/balanceRosters';
import { registerSettingsHandlers, getDifficultyFactor } from './handlers/settingsHandlers';
import { registerTradeHandlers } from './handlers/tradeHandlers';
import { registerSimHandlers } from './handlers/simHandlers';

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

// ─── Market Rate Helper ───────────────────────────────────────────────────────

const MARKET_RATE_TABLE: Record<string, [number, number][]> = {
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
const TRAIT_MUL: Record<string, number> = { Normal: 1.0, Star: 1.1, Superstar: 1.25, 'X-Factor': 1.45 };

function calcFairMarket(ovr: number, position: string, devTrait: string): number {
  const rates = MARKET_RATE_TABLE[position] ?? MARKET_RATE_TABLE['LB'];
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
  return Math.round(base * (TRAIT_MUL[devTrait] ?? 1.0) * 10) / 10;
}

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

// ─── Contracts ────────────────────────────────────────────────────────────────

ipcMain.handle('get-team-contracts', (_event: any, teamId: number) => {
  return db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait, p.roster_status,
           c.annual_salary, c.years_remaining, c.years_total,
           c.guaranteed_amount, c.guaranteed_pct,
           c.id as contract_id
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id = ? AND p.roster_status = 'active'
    ORDER BY c.annual_salary DESC
  `).all(teamId);
});

ipcMain.handle('get-practice-squad', (_event: any, teamId: number) => {
  return db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait,
           c.annual_salary, c.years_remaining
    FROM players p
    LEFT JOIN contracts c ON c.player_id = p.id
    WHERE p.team_id = ? AND p.roster_status = 'practice_squad'
    ORDER BY p.overall_rating DESC
  `).all(teamId);
});

ipcMain.handle('get-cap-summary', (_event: any, teamId: number) => {
  const SALARY_CAP = 279.2;
  const result = db.prepare(`
    SELECT COALESCE(SUM(c.annual_salary), 0) as used_cap
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id = ? AND p.roster_status = 'active'
  `).get(teamId) as any;
  const usedCap = Math.round(result.used_cap * 10) / 10;
  return {
    total_cap: SALARY_CAP,
    used_cap: usedCap,
    available_cap: Math.round((SALARY_CAP - usedCap) * 10) / 10,
  };
});

ipcMain.handle('get-roster-spots', (_event: any, teamId: number) => {
  const counts = db.prepare(`
    SELECT roster_status, COUNT(*) as count
    FROM players WHERE team_id = ? GROUP BY roster_status
  `).all(teamId) as any[];
  const active = counts.find((r: any) => r.roster_status === 'active')?.count ?? 0;
  const ps = counts.find((r: any) => r.roster_status === 'practice_squad')?.count ?? 0;
  return { active, ps, activeMax: 53, psMax: 16, activeFree: 53 - active, psFree: 16 - ps };
});

ipcMain.handle('sign-free-agent-to-ps', (_event: any, playerId: number) => {
  const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  if (!teamRow) return { success: false, reason: 'No franchise selected.' };
  const teamId = parseInt(teamRow.value);

  const psCount = (db.prepare(
    "SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'practice_squad'"
  ).get(teamId) as any).count;
  if (psCount >= 16) return { success: false, reason: 'Practice squad is full (16/16).' };

  const player = db.prepare(
    'SELECT id, first_name, last_name, position FROM players WHERE id = ? AND team_id IS NULL'
  ).get(playerId) as any;
  if (!player) return { success: false, reason: 'Player not available.' };

  db.prepare("UPDATE players SET team_id = ?, roster_status = 'practice_squad', is_free_agent = 0 WHERE id = ?")
    .run(teamId, playerId);

  const existing = db.prepare('SELECT id FROM contracts WHERE player_id = ?').get(playerId);
  if (existing) {
    db.prepare(
      'UPDATE contracts SET team_id = ?, years_total = 1, years_remaining = 1, annual_salary = 0.87, guaranteed_amount = 0, guaranteed_pct = 0 WHERE player_id = ?'
    ).run(teamId, playerId);
  } else {
    db.prepare(
      'INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct) VALUES (?, ?, 1, 1, 0.87, 0, 0)'
    ).run(playerId, teamId);
  }

  return { success: true, name: `${player.first_name} ${player.last_name}` };
});

ipcMain.handle('get-free-agents', (_event: any, position?: string) => {
  const query = position && position !== 'ALL'
    ? "SELECT id, first_name, last_name, position, position_label, overall_rating, age, dev_trait FROM players WHERE is_free_agent = 1 AND position = ? ORDER BY overall_rating DESC LIMIT 200"
    : "SELECT id, first_name, last_name, position, position_label, overall_rating, age, dev_trait FROM players WHERE is_free_agent = 1 ORDER BY overall_rating DESC LIMIT 200";
  return position && position !== 'ALL'
    ? db.prepare(query).all(position)
    : db.prepare(query).all();
});

ipcMain.handle('extend-player', (_event: any, { playerId, years, salary }: {
  playerId: number; years: number; salary: number;
}) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE player_id = ?').get(playerId) as any;
  if (!contract) return { success: false, reason: 'No contract found.' };
  const guaranteedPct = Math.round(40 + Math.random() * 20);
  const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;
  db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
    .run(years, years, salary, guaranteedAmount, guaranteedPct, playerId);
  return { success: true };
});

ipcMain.handle('restructure-player', (_event: any, { playerId, pct }: { playerId: number; pct: number }) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE player_id = ?').get(playerId) as any;
  if (!contract) return { success: false, reason: 'No contract found.' };
  if (contract.years_remaining < 2) return { success: false, reason: 'Need 2+ years remaining to restructure.' };

  const convertedAmount = contract.annual_salary * pct;
  const savings = Math.round(convertedAmount * (1 - 1 / contract.years_remaining) * 10) / 10;
  const newSalary = Math.round((contract.annual_salary - savings) * 10) / 10;
  const newGuaranteed = Math.round(((contract.guaranteed_amount ?? 0) + convertedAmount) * 10) / 10;
  const newGuaranteedPct = Math.min(100, Math.round((newGuaranteed / (newSalary * contract.years_remaining)) * 100));

  db.prepare('UPDATE contracts SET annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
    .run(newSalary, newGuaranteed, newGuaranteedPct, playerId);

  return { success: true, savings, newSalary };
});

ipcMain.handle('release-player', (_event: any, playerId: number) => {
  const season = getCurrentSeason();
  const scheduleExists = (db.prepare(
    'SELECT COUNT(*) as count FROM games WHERE season = ? AND is_playoff = 0'
  ).get(season) as any).count > 0;
  const isInSeason = scheduleExists;

  const currentWeekRow = db.prepare(
    'SELECT MIN(week) as week FROM games WHERE season = ? AND is_simulated = 0 AND is_playoff = 0'
  ).get(season) as any;
  const currentWeek = currentWeekRow?.week ?? 1;

  const playerRow = db.prepare('SELECT team_id FROM players WHERE id = ?').get(playerId) as any;
  const releasingTeamId = playerRow?.team_id ?? null;

  if (isInSeason) {
    db.prepare(`UPDATE players SET team_id = NULL, is_free_agent = 0, roster_status = 'waivers', waived_by_team_id = ?, waiver_placed_week = ? WHERE id = ?`)
      .run(releasingTeamId, currentWeek, playerId);
  } else {
    db.prepare('DELETE FROM contracts WHERE player_id = ?').run(playerId);
    db.prepare(`UPDATE players SET team_id = NULL, is_free_agent = 1, roster_status = 'free_agent', waived_by_team_id = NULL, waiver_placed_week = NULL WHERE id = ?`)
      .run(playerId);
  }
  return { success: true, onWaivers: !!isInSeason };
});

ipcMain.handle('get-team-stats', (_event: any, teamId: number, season?: number) => {
  const s = season ?? getCurrentSeason();
  return db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
           p.overall_rating, p.age, p.position, p.dev_trait,
           t.city || ' ' || t.name AS team_name,
           SUM(st.pass_yards) AS pass_yards, SUM(st.pass_tds) AS pass_tds,
           SUM(st.interceptions) AS interceptions, SUM(st.completions) AS completions,
           SUM(st.pass_attempts) AS pass_attempts,
           SUM(st.rush_yards) AS rush_yards, SUM(st.rush_tds) AS rush_tds, SUM(st.rush_attempts) AS rush_attempts,
           SUM(st.rec_yards) AS rec_yards, SUM(st.rec_tds) AS rec_tds,
           SUM(st.receptions) AS receptions, SUM(st.targets) AS targets,
           SUM(st.tackles) AS tackles, SUM(st.assisted_tackles) AS assisted_tackles,
           SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl, SUM(st.forced_fumbles) AS forced_fumbles,
           SUM(st.def_interceptions) AS def_interceptions,
           SUM(st.pass_deflections) AS pass_deflections, SUM(st.def_tds) AS def_tds
    FROM stats st
    JOIN players p ON st.player_id = p.id
    JOIN teams t ON st.team_id = t.id
    JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.team_id = ?
    GROUP BY p.id
  `).all(s, teamId);
});

ipcMain.handle('promote-from-ps', (_event: any, playerId: number) => {
  const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  if (!teamRow) return { success: false, reason: 'No franchise selected.' };
  const teamId = parseInt(teamRow.value);

  const active = (db.prepare("SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active'").get(teamId) as any).count;
  if (active >= 53) return { success: false, reason: 'Active roster is full (53/53). Release a player first.' };

  const player = db.prepare('SELECT * FROM players WHERE id = ? AND roster_status = ?').get(playerId, 'practice_squad') as any;
  if (!player) return { success: false, reason: 'Player not on practice squad.' };

  db.prepare("UPDATE players SET roster_status = 'active' WHERE id = ?").run(playerId);

  const SAL_RANGES: Record<string, [number, number]> = {
    QB: [1.0, 42], WR: [1.0, 28], DL: [1.0, 32], LB: [1.0, 18],
    CB: [1.0, 22], TE: [1.0, 16], OL: [1.0, 22], S: [1.0, 18],
    RB: [1.0, 16], K: [1.0, 4],
  };
  const [minSal, maxSal] = SAL_RANGES[player.position] ?? [1.0, 10];
  const ovrFactor = Math.pow(Math.max(0, (player.overall_rating - 70)) / 29, 2.5);
  const salary = Math.round((minSal + ovrFactor * (maxSal - minSal)) * 10) / 10;
  const years = player.age <= 25 ? 3 : player.age <= 29 ? 2 : 1;

  const existing = db.prepare('SELECT id FROM contracts WHERE player_id = ?').get(playerId);
  if (existing) {
    db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
      .run(years, years, salary, Math.round(salary * years * 0.3 * 10) / 10, 30, playerId);
  } else {
    db.prepare('INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(playerId, teamId, years, years, salary, Math.round(salary * years * 0.3 * 10) / 10, 30);
  }

  return { success: true, name: `${player.first_name} ${player.last_name}` };
});

ipcMain.handle('sign-free-agent', (_event: any, { playerId, years, salary }: {
  playerId: number; years: number; salary: number;
}) => {
  const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  if (!teamRow) return { success: false, reason: 'No franchise selected.' };
  const teamId = parseInt(teamRow.value);

  const spots = (db.prepare("SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active'").get(teamId) as any).count;
  if (spots >= 53) return { success: false, reason: 'Active roster is full (53/53). Release a player first.' };

  const player = db.prepare('SELECT id, overall_rating, age, position, dev_trait FROM players WHERE id = ?').get(playerId) as any;
  if (!player) return { success: false, reason: 'Player not found.' };

  const fairMarket = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
  const ratio = salary / Math.max(fairMarket, 1);

  let acceptChance =
    ratio >= 1.00 ? 1.00 :
    ratio >= 0.85 ? 0.90 :
    ratio >= 0.70 ? 0.60 :
    ratio >= 0.50 ? 0.20 : 0.00;

  if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.20);
  if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.10);

  const season = getCurrentSeason();
  const record = db.prepare(`
    SELECT
      SUM(CASE WHEN (home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END) as wins,
      COUNT(*) as played
    FROM games WHERE (home_team_id = ? OR away_team_id = ?) AND season = ? AND is_simulated = 1 AND is_playoff = 0
  `).get(teamId, teamId, teamId, teamId, season) as any;
  const winPct = record?.played >= 4 ? record.wins / record.played : 0.5;
  if (winPct >= 0.65) acceptChance = Math.min(1, acceptChance + 0.08);

  const accepted = Math.random() < acceptChance;

  if (!accepted) {
    const reason =
      ratio < 0.50 ? `Insulted by the offer. ${player.dev_trait === 'X-Factor' || player.dev_trait === 'Superstar' ? 'Elite players' : 'Players'} don't sign for that salary.` :
      ratio < 0.70 ? `Not enough money. Looking for closer to ${fairMarket.toFixed(1)}M/yr on the open market.` :
      ratio < 0.85 ? `Decided to explore other options. Try sweetening the offer slightly.` :
      `Chose to sign elsewhere. Sometimes it just doesn't work out.`;
    return { success: false, reason };
  }

  const guaranteedPct = Math.round(30 + Math.random() * 30);
  const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;

  db.prepare("UPDATE players SET team_id = ?, is_free_agent = 0, roster_status = 'active' WHERE id = ?").run(teamId, playerId);
  db.prepare(`INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(playerId, teamId, years, years, salary, guaranteedAmount, guaranteedPct);
  return { success: true };
});

ipcMain.handle('get-expiring-contracts', () => {
  const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  if (!teamRow) return [];
  const teamId = parseInt(teamRow.value);
  return db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait,
           c.annual_salary, c.years_remaining, c.years_total,
           c.guaranteed_amount, c.guaranteed_pct, c.id as contract_id
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id = ? AND p.roster_status = 'active' AND c.years_remaining = 1
    ORDER BY c.annual_salary DESC
  `).all(teamId);
});

ipcMain.handle('resign-player', (_event: any, { playerId, years, salary }: {
  playerId: number; years: number; salary: number;
}) => {
  const player = db.prepare('SELECT id, overall_rating, age, position, dev_trait FROM players WHERE id = ?').get(playerId) as any;
  if (!player) return { success: false, reason: 'Player not found.' };

  const fairMarket = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
  const ratio = salary / Math.max(fairMarket, 1);

  let acceptChance =
    ratio >= 1.00 ? 1.00 :
    ratio >= 0.85 ? 0.95 :
    ratio >= 0.70 ? 0.70 :
    ratio >= 0.50 ? 0.25 : 0.00;

  if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.15);
  if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.08);

  const accepted = Math.random() < acceptChance;

  if (!accepted) {
    const reason =
      ratio < 0.50 ? `Insulted by the offer. Looking for around ${fairMarket.toFixed(1)}M/yr.` :
      ratio < 0.70 ? `Not enough to stay. Asking price is closer to ${fairMarket.toFixed(1)}M/yr.` :
      ratio < 0.85 ? `Wants to test the market. Try offering closer to ${fairMarket.toFixed(1)}M/yr.` :
      `Decided to explore other options despite the offer.`;
    return { success: false, reason, willHitFA: true };
  }

  const guaranteedPct = Math.round(35 + Math.random() * 25);
  const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;
  db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
    .run(years, years, salary, guaranteedAmount, guaranteedPct, playerId);
  return { success: true };
});

ipcMain.handle('get-offseason-status', () => {
  const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  const season = getCurrentSeason();
  const champion = db.prepare('SELECT team_id FROM champions WHERE season = ?').get(season);
  const draftGenerated = champion
    ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ?').get(season) as any).count > 0
    : false;
  const draftComplete = draftGenerated
    ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ? AND is_drafted = 0').get(season) as any).count === 0
    : false;
  if (!teamRow) return { playoffsComplete: !!champion, pendingResigns: 0, draftGenerated, draftComplete };
  const teamId = parseInt(teamRow.value);
  const pending = (db.prepare(`
    SELECT COUNT(*) as count FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id = ? AND p.roster_status = 'active' AND c.years_remaining = 1
  `).get(teamId) as any).count;
  return { playoffsComplete: !!champion, pendingResigns: pending, draftGenerated, draftComplete };
});

// ─── CPU Free Agency ──────────────────────────────────────────────────────────

ipcMain.handle('cpu-fa-signing', () => {
  const userTeamIdRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  const userTeamId = userTeamIdRow ? parseInt(userTeamIdRow.value) : -1;

  const MIN_ROSTER: Record<string, number> = {
    QB: 2, RB: 3, WR: 4, TE: 2, OL: 6, DL: 4, LB: 4, CB: 4, S: 2, K: 1,
  };

  const cpuTeams = db.prepare('SELECT id FROM teams WHERE id != ?').all(userTeamId) as any[];
  let totalSigned = 0;
  const signingsByTeam: Record<number, number> = {};

  const runSignings = db.transaction(() => {
    for (const team of cpuTeams) {
      const activeCount = (db.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ? AND roster_status = 'active'").get(team.id) as any).cnt;
      let slotsLeft = 53 - activeCount;
      if (slotsLeft <= 0) continue;

      const posCounts = db.prepare(`
        SELECT position, COUNT(*) as cnt
        FROM players WHERE team_id = ? AND roster_status = 'active'
        GROUP BY position
      `).all(team.id) as any[];
      const byPos: Record<string, number> = {};
      for (const r of posCounts) byPos[r.position] = r.cnt;

      let teamSigned = 0;
      for (const [pos, minCount] of Object.entries(MIN_ROSTER)) {
        if (slotsLeft <= 0) break;
        const current = byPos[pos] ?? 0;
        const needed = Math.max(0, minCount - current);

        for (let i = 0; i < needed && slotsLeft > 0; i++) {
          const fa = db.prepare(`
            SELECT id, overall_rating, age, position, dev_trait
            FROM players WHERE is_free_agent = 1 AND position = ?
            ORDER BY overall_rating DESC LIMIT 1
          `).get(pos) as any;
          if (!fa) break;

          const fair = calcFairMarket(fa.overall_rating, fa.position, fa.dev_trait);
          const salary = Math.round(fair * (0.90 + Math.random() * 0.15) * 10) / 10;
          const years = fa.age <= 27 ? 2 : 1;
          const gtd = Math.round(salary * years * 0.30 * 10) / 10;

          db.prepare("UPDATE players SET team_id = ?, is_free_agent = 0, roster_status = 'active' WHERE id = ?")
            .run(team.id, fa.id);
          db.prepare(`
            INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct)
            VALUES (?, ?, ?, ?, ?, ?, 30)
          `).run(fa.id, team.id, years, years, salary, gtd);

          totalSigned++;
          teamSigned++;
          slotsLeft--;
        }
      }
      if (teamSigned > 0) signingsByTeam[team.id] = teamSigned;
    }
  });
  runSignings();

  const teamsActive = Object.keys(signingsByTeam).length;
  return { totalSigned, teamsActive };
});

// ─── Draft ────────────────────────────────────────────────────────────────────

ipcMain.handle('generate-draft-class', () => {
  const season = getCurrentSeason();
  const existing = (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ?').get(season) as any).count;
  if (existing > 0) return { already: true, count: existing };

  const FIRST = ['James','John','Robert','Michael','David','William','Joseph','Thomas','Charles','Christopher','Daniel','Matthew','Anthony','Mark','Steven','Paul','Andrew','Joshua','Kenneth','Kevin','Brian','Timothy','Jason','Jeffrey','Ryan','Jacob','Gary','Nicholas','Eric','Jonathan','Justin','Scott','Brandon','Benjamin','Samuel','Nathan','Zachary','Peter','Kyle','Noah','Ethan','Jeremy','Austin','Sean','Dylan','Jordan','Jesse','Bryan','Gabriel','Logan','Marcus','Malik','Darius','Terrell','Jamal','Xavier','Darnell','Lamar','Kendall','Jaylen','Jalen','Devonte','Trey','Kameron','Zion','Isaiah','Damien','Dominic','Julian','Elijah','Tyrese','DeAndre','Rashad','Corey','Marquise','Deon','Alonzo','Deshawn','Marquez','Keanu','Trevon','Devin','Javon','Treylon','Brock','Bryce','Drake','Garrett','Caleb','Quinton','Jaylon','Dontae','Tariq','Amon','Romeo','Tyjae'];
  const LAST = ['Smith','Johnson','Williams','Jones','Brown','Davis','Miller','Wilson','Moore','Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Garcia','Robinson','Clark','Lewis','Lee','Walker','Hall','Allen','Young','King','Wright','Hill','Scott','Green','Adams','Baker','Nelson','Carter','Mitchell','Roberts','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart','Morris','Rogers','Reed','Cook','Morgan','Bell','Murphy','Bailey','Cooper','Richardson','Cox','Howard','Ward','Peterson','Gray','James','Watson','Brooks','Kelly','Sanders','Price','Bennett','Wood','Barnes','Ross','Henderson','Coleman','Jenkins','Perry','Powell','Long','Patterson','Hughes','Washington','Butler','Simmons','Foster','Bryant','Alexander','Russell','Griffin','Hayes','Ford','Hamilton','Graham','Sullivan','Wallace','Woods','Cole','West','Jordan','Owens','Reynolds','Fisher','Harrison','Gibson','McDonald','Marshall','Murray','Freeman','Wells','Tucker','Porter','Hunter','Hicks','Henry','Boyd','Mason','Kennedy','Warren','Burns','Gordon','Shaw','Holmes','Rice','Robertson','Hunt','Daniels','Palmer','Nichols','Grant','Knight','Ferguson','Stone','Hawkins','Perkins','Hudson','Spencer','Gardner','Payne','Pierce','Berry','Matthews','Willis','Ray','Watkins','Carroll','Duncan','Hart','Cunningham','Bradley','Andrews','Harper','Fox','Riley','Armstrong','Greene','Lawrence','Elliott','Sims','Morrow','Ingram','Bates','Flowers','Moss','Lamb'];
  const POS_POOL = ['QB','RB','WR','WR','WR','TE','OL','OL','OL','DL','DL','DL','LB','LB','CB','CB','S','K'];

  const getDevTrait = (ovr: number): string => {
    const r = Math.random();
    if (ovr >= 78) return r < 0.02 ? 'X-Factor' : r < 0.08 ? 'Superstar' : r < 0.40 ? 'Star' : 'Normal';
    if (ovr >= 74) return r < 0.01 ? 'X-Factor' : r < 0.05 ? 'Superstar' : r < 0.25 ? 'Star' : 'Normal';
    if (ovr >= 70) return r < 0.005 ? 'Superstar' : r < 0.12 ? 'Star' : 'Normal';
    return r < 0.05 ? 'Star' : 'Normal';
  };

  const prospects: any[] = [];
  for (let i = 0; i < 280; i++) {
    let ovr: number;
    if (i < 10) ovr = Math.floor(Math.random() * 7) + 76;
    else if (i < 32) ovr = Math.floor(Math.random() * 7) + 71;
    else if (i < 64) ovr = Math.floor(Math.random() * 6) + 67;
    else if (i < 96) ovr = Math.floor(Math.random() * 6) + 64;
    else if (i < 128) ovr = Math.floor(Math.random() * 5) + 61;
    else if (i < 160) ovr = Math.floor(Math.random() * 5) + 59;
    else if (i < 224) ovr = Math.floor(Math.random() * 5) + 57;
    else ovr = Math.floor(Math.random() * 6) + 52;

    prospects.push({
      season,
      first_name: FIRST[Math.floor(Math.random() * FIRST.length)],
      last_name: LAST[Math.floor(Math.random() * LAST.length)],
      position: POS_POOL[Math.floor(Math.random() * POS_POOL.length)],
      overall_rating: ovr,
      dev_trait: getDevTrait(ovr),
      age: Math.random() < 0.6 ? 21 : Math.random() < 0.6 ? 22 : 23,
    });
  }

  const ins = db.prepare(`INSERT INTO draft_prospects (season,first_name,last_name,position,overall_rating,dev_trait,age) VALUES (@season,@first_name,@last_name,@position,@overall_rating,@dev_trait,@age)`);
  const run = db.transaction(() => { for (const p of prospects) ins.run(p); });
  run();
  return { generated: prospects.length };
});

ipcMain.handle('get-draft-class', () => {
  const season = getCurrentSeason();
  return db.prepare('SELECT * FROM draft_prospects WHERE season = ? ORDER BY overall_rating DESC').all(season);
});

ipcMain.handle('get-draft-order', () => {
  const season = getCurrentSeason();
  return db.prepare(`
    SELECT t.id, t.city, t.name, t.abbreviation,
      COALESCE((
        SELECT COUNT(*) FROM games g
        WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
          AND ((g.home_team_id = t.id AND g.home_score > g.away_score)
            OR (g.away_team_id = t.id AND g.away_score > g.home_score))
      ), 0) as wins,
      COALESCE((
        SELECT COUNT(*) FROM games g
        WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
          AND (g.home_team_id = t.id OR g.away_team_id = t.id)
      ), 0) as losses
    FROM teams t ORDER BY wins ASC, losses DESC, t.id ASC
  `).all(season, season);
});

ipcMain.handle('get-round-pick-order', (_event: any, { round }: { round: number }) => {
  const season = getCurrentSeason();
  const teamSlots = db.prepare(`
    SELECT t.id as team_id,
      COALESCE((SELECT COUNT(*) FROM games g WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
        AND ((g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score))), 0) as wins,
      COALESCE((SELECT COUNT(*) FROM games g WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
        AND (g.home_team_id = t.id OR g.away_team_id = t.id)), 0) as losses
    FROM teams t ORDER BY wins ASC, losses DESC, t.id ASC
  `).all(season, season) as any[];

  const picks = db.prepare(`
    SELECT pa.id, pa.owner_team_id, pa.original_team_id, pa.is_used,
           ow.city as owner_city, ow.name as owner_name
    FROM pick_assets pa
    JOIN teams ow ON ow.id = pa.owner_team_id
    WHERE pa.season = ? AND pa.round = ?
  `).all(season, round) as any[];

  return teamSlots.map((ts: any, idx: number) => {
    const pick = picks.find((p: any) => p.original_team_id === ts.team_id);
    return {
      slot: idx + 1,
      originalTeamId: ts.team_id,
      ownerTeamId: pick?.owner_team_id ?? ts.team_id,
      ownerCity: pick?.owner_city ?? '',
      ownerName: pick?.owner_name ?? '',
      pickAssetId: pick?.id ?? null,
      isUsed: pick?.is_used === 1,
      isTraded: pick ? pick.owner_team_id !== pick.original_team_id : false,
    };
  });
});

ipcMain.handle('make-draft-pick', (_event: any, { prospectId, teamId, round, pick }: {
  prospectId: number; teamId: number; round: number; pick: number;
}) => {
  const prospect = db.prepare('SELECT * FROM draft_prospects WHERE id = ?').get(prospectId) as any;
  if (!prospect || prospect.is_drafted) return { success: false, reason: 'Not available.' };

  db.prepare('UPDATE draft_prospects SET is_drafted=1, draft_round=?, draft_pick=?, drafted_by_team_id=? WHERE id=?')
    .run(round, pick, teamId, prospectId);

  const rookie = db.prepare(`
    INSERT INTO players (first_name,last_name,position,age,overall_rating,speed,strength,awareness,team_id,is_free_agent,dev_trait,roster_status)
    VALUES (?,?,?,?,?,?,?,?,?,0,?,'active')
  `).run(
    prospect.first_name, prospect.last_name, prospect.position, prospect.age, prospect.overall_rating,
    Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
    teamId, prospect.dev_trait
  ) as any;

  const sal = Math.round((0.9 + (prospect.overall_rating - 60) * 0.05) * 10) / 10;
  db.prepare(`INSERT INTO contracts (player_id,team_id,years_total,years_remaining,annual_salary,guaranteed_amount,guaranteed_pct) VALUES (?,?,4,4,?,?,50)`)
    .run(rookie.lastInsertRowid, teamId, sal, sal * 4 * 0.5);
  const usedPick = db.prepare('SELECT id FROM pick_assets WHERE owner_team_id = ? AND round = ? AND season = ? AND is_used = 0 LIMIT 1').get(teamId, round, getCurrentSeason()) as any;
  if (usedPick) db.prepare('UPDATE pick_assets SET is_used = 1 WHERE id = ?').run(usedPick.id);

  return { success: true };
});

ipcMain.handle('scout-prospect', (_event: any, prospectId: number) => {
  const season = getCurrentSeason();
  const used = (db.prepare('SELECT COUNT(*) as c FROM draft_prospects WHERE season = ? AND scouted = 1').get(season) as any).c;
  if (used >= 25) return { success: false, reason: 'No scouts remaining.' };
  db.prepare('UPDATE draft_prospects SET scouted = 1 WHERE id = ?').run(prospectId);
  return { success: true };
});

ipcMain.handle('get-scout-count', () => {
  const season = getCurrentSeason();
  return (db.prepare('SELECT COUNT(*) as c FROM draft_prospects WHERE season = ? AND scouted = 1').get(season) as any).c;
});

ipcMain.handle('run-cpu-round', (_event: any, { round, userTeamId }: { round: number; userTeamId: number }) => {
  const season = getCurrentSeason();
  const teamSlots = db.prepare(`
    SELECT t.id as team_id,
      COALESCE((SELECT COUNT(*) FROM games g WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
        AND ((g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score))), 0) as wins,
      COALESCE((SELECT COUNT(*) FROM games g WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
        AND (g.home_team_id = t.id OR g.away_team_id = t.id)), 0) as losses
    FROM teams t ORDER BY wins ASC, losses DESC, t.id ASC
  `).all(season, season) as any[];

  const roundPicks = db.prepare(`
    SELECT pa.id, pa.owner_team_id, pa.original_team_id
    FROM pick_assets pa
    WHERE pa.season = ? AND pa.round = ? AND pa.is_used = 0
  `).all(season, round) as any[];

  const THRESHOLDS: Record<string, number> = { QB:2, RB:3, WR:5, TE:2, OL:5, DL:4, LB:4, CB:4, S:2, K:1 };
  const results: any[] = [];

  const runPicks = db.transaction(() => {
    for (let i = 0; i < teamSlots.length; i++) {
      const original = teamSlots[i];
      const pickAsset = roundPicks.find((p: any) => p.original_team_id === original.team_id);
      const ownerTeamId = pickAsset?.owner_team_id ?? original.team_id;

      if (ownerTeamId === userTeamId) continue;
      if (pickAsset?.is_used) continue;

      const counts = db.prepare(`SELECT position, COUNT(*) as cnt FROM players WHERE team_id=? GROUP BY position`).all(ownerTeamId) as any[];
      const byPos: Record<string, number> = {};
      for (const r of counts) byPos[r.position] = r.cnt;
      const needs = Object.keys(THRESHOLDS).filter(pos => (byPos[pos] ?? 0) < THRESHOLDS[pos]);

      let prospect: any = null;
      if (needs.length > 0) {
        const ph = needs.map(() => '?').join(',');
        prospect = db.prepare(`SELECT * FROM draft_prospects WHERE season=? AND is_drafted=0 AND position IN (${ph}) ORDER BY overall_rating DESC LIMIT 1`).get(season, ...needs);
      }
      if (!prospect) prospect = db.prepare('SELECT * FROM draft_prospects WHERE season=? AND is_drafted=0 ORDER BY overall_rating DESC LIMIT 1').get(season);
      if (!prospect) continue;

      const overallPick = (round - 1) * 32 + (i + 1);
      db.prepare('UPDATE draft_prospects SET is_drafted=1, draft_round=?, draft_pick=?, drafted_by_team_id=? WHERE id=?')
        .run(round, overallPick, ownerTeamId, prospect.id);

      const r = db.prepare(`INSERT INTO players (first_name,last_name,position,age,overall_rating,speed,strength,awareness,team_id,is_free_agent,dev_trait,roster_status) VALUES (?,?,?,?,?,?,?,?,?,0,?,'active')`).run(
        prospect.first_name, prospect.last_name, prospect.position, prospect.age, prospect.overall_rating,
        Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
        ownerTeamId, prospect.dev_trait
      ) as any;
      const sal = Math.round((0.9 + (prospect.overall_rating - 60) * 0.05) * 10) / 10;
      db.prepare(`INSERT INTO contracts (player_id,team_id,years_total,years_remaining,annual_salary,guaranteed_amount,guaranteed_pct) VALUES (?,?,4,4,?,?,50)`).run(r.lastInsertRowid, ownerTeamId, sal, sal * 4 * 0.5);

      if (pickAsset) db.prepare('UPDATE pick_assets SET is_used = 1 WHERE id = ?').run(pickAsset.id);
      results.push({ round, pickInRound: i + 1, teamId: ownerTeamId, prospect });
    }
  });
  runPicks();
  return results;
});

ipcMain.handle('complete-draft', () => {
  const season = getCurrentSeason();
  const undrafted = db.prepare('SELECT * FROM draft_prospects WHERE season=? AND is_drafted=0').all(season) as any[];
  const run = db.transaction(() => {
    for (const p of undrafted) {
      db.prepare(`INSERT INTO players (first_name,last_name,position,age,overall_rating,speed,strength,awareness,team_id,is_free_agent,dev_trait,roster_status) VALUES (?,?,?,?,?,?,?,?,NULL,1,?,'free_agent')`).run(
        p.first_name, p.last_name, p.position, p.age, p.overall_rating,
        Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
        p.dev_trait
      );
      db.prepare('UPDATE draft_prospects SET is_drafted=1 WHERE id=?').run(p.id);
    }
  });
  run();
  return { undrafted: undrafted.length };
});

ipcMain.handle('import-otc-contracts', (_event: any, filePath?: string) => {
  const fs = require('fs');
  const pathModule = require('path');

  let otcPath = filePath;
  if (!otcPath) {
    const candidates = ['otc-contracts.html', 'otc-contracts.htm', 'otc-contracts.md', 'Contracts_Over_the_Cap.htm', 'Contracts_Over_the_Cap.html'];
    for (const name of candidates) {
      const p = pathModule.join(process.cwd(), name);
      if (fs.existsSync(p)) { otcPath = p; break; }
    }
  }
  if (!otcPath || !fs.existsSync(otcPath)) {
    return { success: false, reason: 'OTC file not found. Pass the full path or place the file in the project root.' };
  }

  const content: string = fs.readFileSync(otcPath, 'utf8');
  const parseMoney = (s: string): number => parseFloat(s.replace(/[$,]/g, '')) || 0;
  const isHtml = content.trimStart().startsWith('<');

  interface OtcRow { name: string; position: string; aav: number; years: number; guaranteed: number; }
  const rows: OtcRow[] = [];

  if (isHtml) {
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim();
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(content)) !== null) {
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      const cellReCopy = new RegExp(cellRe.source, 'gi');
      while ((cellMatch = cellReCopy.exec(rowMatch[1])) !== null) {
        cells.push(stripTags(cellMatch[1]));
      }
      if (cells.length < 5) continue;
      const cell2AsYears = parseInt(cells[2]);
      const isFormatA = cell2AsYears >= 1 && cell2AsYears <= 15 && parseMoney(cells[3]) > 0;
      let name: string, position: string, aav: number, years: number, gtd: number;
      name = cells[0];
      position = cells[1] ?? '';
      if (isFormatA) {
        years = cell2AsYears;
        aav = parseMoney(cells[3]);
        gtd = parseMoney(cells[4]);
      } else {
        const totalValue = parseMoney(cells[3]);
        aav = parseMoney(cells[4]);
        gtd = parseMoney(cells[5] ?? '0');
        years = aav > 0 ? Math.round(totalValue / aav) : 0;
        if (years < 1 || years > 15) years = 0;
      }
      if (aav > 0 && years > 0) {
        rows.push({ name, position, aav: aav / 1_000_000, years, guaranteed: gtd / 1_000_000 });
      }
    }
  } else {
    for (const line of content.split('\n')) {
      const parts = line.split(',');
      if (parts.length >= 4) {
        const aav = parseMoney(parts[3]);
        const years = parseInt(parts[2]) || 0;
        if (aav > 0 && years > 0) {
          rows.push({ name: parts[0].trim(), position: parts[1]?.trim() ?? '', aav: aav / 1_000_000, years, guaranteed: parseMoney(parts[4] ?? '0') / 1_000_000 });
        }
      }
    }
  }

  let matched = 0;
  const normalize = (s: string) => s.toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z]/g, '');

  const updateContract = db.transaction(() => {
    for (const row of rows) {
      const nameParts = row.name.trim().split(/\s+/);
      if (nameParts.length < 2) continue;
      const first = normalize(nameParts[0]);
      const last = normalize(nameParts[nameParts.length - 1]);

      const players = db.prepare(`
        SELECT p.id, p.first_name, p.last_name FROM players p
        JOIN contracts c ON c.player_id = p.id
        WHERE p.is_free_agent = 0 AND p.roster_status = 'active'
      `).all() as any[];

      let player = players.find((p: any) =>
        normalize(p.first_name) === first && normalize(p.last_name) === last
      );
      if (!player) {
        const firstInitial = first.charAt(0);
        player = players.find((p: any) =>
          normalize(p.last_name) === last &&
          normalize(p.first_name).charAt(0) === firstInitial
        );
      }
      if (!player) continue;

      const gtdPct = row.guaranteed > 0 && row.aav > 0
        ? Math.min(100, Math.round((row.guaranteed / (row.aav * row.years)) * 100))
        : 30;

      db.prepare(`
        UPDATE contracts SET annual_salary = ?, years_remaining = ?, years_total = ?,
        guaranteed_amount = ?, guaranteed_pct = ?
        WHERE player_id = ?
      `).run(row.aav, row.years, row.years, row.guaranteed || Math.round(row.aav * row.years * 0.3 * 10) / 10, gtdPct, player.id);
      matched++;
    }
  });
  updateContract();

  return { success: true, total: rows.length, matched };
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

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
